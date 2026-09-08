#!/bin/sh
# Continuous off-box copy of LND's static channel backup.
#
# LND rewrites channel.backup whenever the channel set changes, and encrypts it
# under a key derived from the wallet seed. It is therefore shipped as-is: a
# target only ever holds ciphertext, and no client-side encryption is added.
#
# A StartOS backup also carries channel.backup, but it is point-in-time, so
# channels opened since the last one are missing from it. This agent is what
# keeps an off-box copy current between those backups.
#
# What a target holds:
#   channel.backup                 the newest copy, for a person to find
#   channel.backup.meta            {"gen":G,"node":N}: which record is current
#   channel.backup.<G>.<N8>        one immutable record per copy shipped; the
#                                  newest $KEEP of this node's are kept
#   channel.backup.unknown-<time>  a copy found with no marker, kept aside
# The record is written first and the marker last, so a run cut off anywhere
# leaves every record intact and a marker that names a complete one.
#
# Modes:
#   (default)         watcher daemon
#   --once            ship now (Back Up Channels Now), within $ONCE_SECS. Exit 0
#                     ok; 1 a target failed, see the state file; 2 restore
#                     pending; 3 no channel.backup yet; 4 no target enabled;
#                     5 another run holds the lock; 6 the settings could not be
#                     read. A copy newer than anything this node has seen,
#                     which the watcher refuses, is kept and replaced.
#   --restore         write the next untried candidate to $RESTORED and its
#                     identity to $CANDIDATE. Exit 0 candidate written; 3 every
#                     candidate has been tried; 6 a target could not be
#                     consulted, so the search is not over
#   --commit-restore  record that restorechanbackup accepted the candidate
#   --reject-restore  record that it refused the candidate
#   --finish-restore  forget the tried candidates once the search is over
# Every mode but the watcher exits non-zero when it cannot record its outcome.
#
# Paths below MUST match startos/utils.ts.
set -u

LND_DIR=/root/.lnd
BACKUP="$LND_DIR/data/chain/bitcoin/mainnet/channel.backup"
RESTORED="$LND_DIR/channel.backup.restored"
CANDIDATE="$RESTORED.gen"
CONFIG="$LND_DIR/channel-backup.json"
FLAGS="$LND_DIR/startup-flags.json"
STATE="$LND_DIR/.channel-backup-state.json"
WATERMARK="$LND_DIR/channel-backup-watermark.json"
LOCK="$LND_DIR/.channel-backup.lock"

WORK=/tmp/lnd-channel-backup
RCONF="$WORK/rclone.conf"
KNOWN_HOSTS="$WORK/known_hosts"
CONFIG_SNAP="$WORK/config.json"
OBJECT=channel.backup
META=channel.backup.meta
KEEP=20

# channel.backup changes a handful of times a day, so polling its identity is
# enough and survives the temp-file-then-rename LND writes it with — a watch on
# the inode does not.
POLL=10
RETRY_SECS=300
# A copy is re-sent daily even when nothing changed, so a deleted copy or a
# revoked credential surfaces within a day instead of at restore time.
BACKSTOP_SECS=86400
# Back Up Channels Now has a 120 s action budget; the run stops starting work
# at this point so that what it did get done is recorded.
ONCE_SECS=95
RCLONE_FLAGS="--contimeout=15s --timeout=120s --retries=2 --low-level-retries=2"
FORCE=0
DEADLINE=0
NODE=''
NODE8=''

log() { echo "[channel-backup] $*" >&2; }
die() {
  log "$*"
  exit 1
}

numor0() { case "$1" in '' | *[!0-9]*) echo 0 ;; *) echo "$1" ;; esac; }
node8() { printf '%s' "$1" | cut -c1-8; }
is_hex() {
  case "$1" in '' | *[!0-9a-f]*) return 1 ;; esac
  [ ${#1} -eq "$2" ]
}
# A generation is epoch seconds or a counter past it: bounded before it reaches
# shell arithmetic.
is_gen() {
  case "$1" in '' | *[!0-9]*) return 1 ;; esac
  [ ${#1} -le 12 ] && [ "$1" -gt 0 ]
}

# rclone logs several timestamped lines and this ends up in a health message,
# so keep the last one without its timestamp and level, and cap it.
reason() {
  printf '%s\n' "$1" | grep -v '^[[:space:]]*$' | tail -n 1 \
    | sed 's|^[0-9/]* [0-9:]* [A-Z]*: ||; s|^Failed to create file system for destination "[^"]*": ||' \
    | cut -c1-160
}

# rclone, cut off at the run's deadline when there is one.
rc() {
  if [ "$DEADLINE" -gt 0 ]; then
    _left=$((DEADLINE - $(date +%s)))
    if [ "$_left" -le 0 ]; then
      echo "out of time" >&2
      return 124
    fi
    timeout "$_left" rclone "$@"
    _r=$?
    [ "$_r" -eq 124 ] && echo "timed out" >&2
    return $_r
  fi
  rclone "$@"
}

# Serializes the watcher, Back Up Channels Now and the restore steps across
# their subcontainers: two writers racing would let an older upload land after
# a newer one. The manual run does not wait: the action has a 120 s budget.
lock() {
  exec 9>>"$LOCK" || die "cannot open $LOCK"
  if [ "$FORCE" = 1 ]; then
    flock -n 9 || exit 5
  else
    flock -x 9 || die "cannot take the lock"
  fi
}
unlock() { flock -u 9; }

# ---- local files -------------------------------------------------------------
# Staged beside the destination and renamed over it, so neither a reader nor a
# StartOS backup ever sees a half-written file.
write_atomic() {
  printf '%s\n' "$2" > "$1.tmp.$$" && sync && mv -f "$1.tmp.$$" "$1"
}

# Returns non-zero when the merge could not be written; callers decide whether
# that is fatal.
state_merge() {
  [ -d "$STATE" ] && return 1
  _cur='{}'
  [ -s "$STATE" ] && _cur=$(cat "$STATE")
  [ -n "$_cur" ] || _cur='{}'
  _new=$(printf '%s' "$_cur" | jq -c "$@" 2>/dev/null) || return 1
  [ -n "$_new" ] || return 1
  write_atomic "$STATE" "$_new"
}
state_get() { jq -r "$1 // empty" "$STATE" 2>/dev/null || true; }
state_num() { numor0 "$(state_get "$1")"; }
incorporated() { numor0 "$(state_get ".incorporated[\"$1\"]")"; }

# One validated copy of the settings per run, so a save landing mid-run cannot
# mix two configurations. A half-written file is not valid JSON and is retried.
snapshot_config() {
  mkdir -p "$WORK"
  if [ -e "$CONFIG" ]; then
    if ! jq -ce . "$CONFIG" > "$CONFIG_SNAP.tmp" 2>/dev/null; then
      rm -f "$CONFIG_SNAP.tmp"
      return 1
    fi
  else
    printf '{}\n' > "$CONFIG_SNAP.tmp"
  fi
  mv -f "$CONFIG_SNAP.tmp" "$CONFIG_SNAP"
}
cfg() { jq -r "$1" "$CONFIG_SNAP" 2>/dev/null; }

# This node's identity, minted once. The state file is excluded from the StartOS
# backup, so a restored node gets a fresh one and never mistakes the copies of
# the node it was restored from for its own.
node_id() {
  _n=$(state_get '.node')
  if ! is_hex "$_n" 32; then
    _n=$(head -c 16 /dev/urandom | od -An -tx1 | tr -d ' \n')
    is_hex "$_n" 32 || return 1
    state_merge --arg n "$_n" '.node = $n' || return 1
  fi
  printf '%s' "$_n"
}
identify() {
  NODE=$(node_id) && is_hex "$NODE" 32 || die "cannot mint the node id"
  NODE8=$(node8 "$NODE")
}

# Failures are "target, code, detail" records; the health check renders them.
fail_target() {
  jq -nc --arg t "$1" --arg c "$2" --arg d "$3" '{target:$t,code:$c,detail:$d}' >> "$WORK/failures"
}
publish_failures() {
  state_merge --argjson f "$(jq -sc . "$WORK/failures" 2>/dev/null || echo '[]')" '.failures = $f'
}

# Whether a target's credentials are complete enough to reach it.
has_creds() {
  case "$1" in
    gdrive | dropbox)
      [ -n "$(cfg ".$1.clientId // empty")" ] && [ -n "$(cfg ".$1.clientSecret // empty")" ] && [ -n "$(cfg ".$1.token // empty")" ]
      ;;
    nextcloud)
      [ -n "$(cfg '.nextcloud.url // empty')" ] && [ -n "$(cfg '.nextcloud.user // empty')" ] && [ -n "$(cfg '.nextcloud.pass // empty')" ]
      ;;
    sftp)
      [ -n "$(cfg '.sftp.host // empty')" ] && [ -n "$(cfg '.sftp.user // empty')" ] \
        && [ "$(cfg '.sftp.hostKeyVerified // false')" = true ] \
        && { [ -n "$(cfg '.sftp.pass // empty')" ] || [ -n "$(cfg '.sftp.keyPem // empty')" ]; }
      ;;
  esac
}

# One "provider:path" line per target: the enabled ones for `ship`, every one
# with complete credentials for `all` (a restore reads disabled targets too).
# Always consumed line by line: a folder name can contain spaces.
remotes() {
  for _p in gdrive dropbox nextcloud sftp; do
    if [ "$1" = ship ]; then
      [ "$(cfg ".$_p.enabled // false")" = true ] || continue
    else
      has_creds "$_p" || continue
    fi
    _pp=$(cfg ".$_p.path // empty")
    [ -n "$_pp" ] || _pp=lnd-channel-backups
    printf '%s:%s\n' "$_p" "$_pp"
  done
}

# Sets $_name, $_path, $_extra and $_dest for a "provider:path" line. $_dest
# names the destination, not the provider slot: what was shipped belongs to a
# place, and editing the slot to point elsewhere must not carry it over.
target() {
  _name=${1%%:*}
  _path=${1#*:}
  _extra=''
  [ "$(cfg ".$_name.insecureTls // false")" = true ] && _extra='--no-check-certificate'
  case "$_name" in
    gdrive | dropbox) _loc="$(cfg ".$_name.clientId // empty")|$_path" ;;
    nextcloud) _loc="$(cfg '.nextcloud.url // empty')|$(cfg '.nextcloud.user // empty')|$_path" ;;
    sftp) _loc="$(cfg '.sftp.host // empty'):$(cfg '.sftp.port // "22"')|$(cfg '.sftp.user // empty')|$_path" ;;
  esac
  _dest="$_name:$(printf '%s' "$_loc" | sha256sum | cut -c1-12)"
}

# A restore is in flight: LND rewrites channel.backup from the restored channel
# set shortly after unlocking, and shipping that would overwrite the current
# copy on every target with an older one. The restore oneshot clears the flag
# once it has run.
restore_pending() {
  [ "$(jq -r '.restore // false' "$FLAGS" 2>/dev/null || echo false)" = true ]
}

# Build rclone.conf from the structured config: one section per target with
# complete credentials, enabled or not. Passwords are stored plaintext in the
# config and obscured HERE, the only format rclone accepts, so the TS side
# never round-trips an obscure heuristic.
build_conf() {
  mkdir -p "$WORK"
  : > "$RCONF"
  if has_creds gdrive; then
    printf '[gdrive]\ntype = drive\nscope = drive\nclient_id = %s\nclient_secret = %s\ntoken = %s\n\n' \
      "$(cfg '.gdrive.clientId // empty')" "$(cfg '.gdrive.clientSecret // empty')" "$(cfg '.gdrive.token // empty')" >> "$RCONF"
  fi
  if has_creds dropbox; then
    printf '[dropbox]\ntype = dropbox\nclient_id = %s\nclient_secret = %s\ntoken = %s\n\n' \
      "$(cfg '.dropbox.clientId // empty')" "$(cfg '.dropbox.clientSecret // empty')" "$(cfg '.dropbox.token // empty')" >> "$RCONF"
  fi
  if has_creds nextcloud; then
    printf '[nextcloud]\ntype = webdav\nurl = %s\nvendor = nextcloud\nuser = %s\npass = %s\n\n' \
      "$(cfg '.nextcloud.url // empty')" "$(cfg '.nextcloud.user // empty')" \
      "$(rclone obscure "$(cfg '.nextcloud.pass // empty')")" >> "$RCONF"
  fi
  if has_creds sftp; then
    # The host keys recorded when the target was saved and confirmed by the
    # user; rclone refuses any other server presenting itself at that address.
    cfg '.sftp.knownHosts // empty' > "$KNOWN_HOSTS"
    {
      printf '[sftp]\ntype = sftp\nhost = %s\nuser = %s\nkey_use_agent = false\nport = %s\nset_modtime = false\nknown_hosts_file = %s\n' \
        "$(cfg '.sftp.host // empty')" "$(cfg '.sftp.user // empty')" "$(cfg '.sftp.port // "22"')" "$KNOWN_HOSTS"
      if [ "$(cfg '.sftp.authType // "password"')" = key ]; then
        # keyPem is stored rclone-ready: one line with literal \n separators.
        printf 'key_pem = %s\n' "$(cfg '.sftp.keyPem // empty')"
      else
        _sp=$(cfg '.sftp.pass // empty')
        [ -n "$_sp" ] && printf 'pass = %s\n' "$(rclone obscure "$_sp")"
      fi
      printf '\n'
    } >> "$RCONF"
  fi
}

# Newest generation this node has shipped; 0 before the first. Rides inside the
# StartOS backup so that generations keep growing across a restore, whatever
# the clock does.
watermark_gen() {
  _w=$(jq -r 'if (.gen|type) == "number" then .gen else empty end' "$WATERMARK" 2>/dev/null)
  if is_gen "$_w"; then echo "$_w"; else echo 0; fi
}

listed() { printf '%s\n' "$_list" | grep -qxF -- "$1"; }

# What the current target holds. Sets $_kind and, for a readable marker, $_have
# and $_node:
#   fresh    nothing there
#   ours     this node's marker: a record of ours is current
#   old      another node's marker, at or below what this node has restored
#            from that node
#   foreign  a channel.backup with no marker beside it
#   newer    another node's marker past anything this node has restored from
#            it: channels it does not know about
#   marker   a marker that cannot be parsed
#   unknown  the target could not be listed or read ($_detail says why)
inspect_target() {
  _have=0
  _node=''
  _kind=fresh
  _detail=''
  # shellcheck disable=SC2086
  _list=$(rc --config "$RCONF" lsf "$_name:$_path" --files-only $RCLONE_FLAGS $_extra 2>"$WORK/err")
  _rc=$?
  # 3 = directory not found: a target nothing has been written to yet.
  [ "$_rc" -eq 3 ] && return 0
  if [ "$_rc" -ne 0 ]; then
    _kind=unknown
    _detail=$(reason "$(cat "$WORK/err")")
    return 0
  fi
  if listed "$META"; then
    rm -f "$WORK/m.json"
    # shellcheck disable=SC2086
    if ! rc --config "$RCONF" copyto "$_name:$_path/$META" "$WORK/m.json" $RCLONE_FLAGS $_extra 2>"$WORK/err"; then
      _kind=unknown
      _detail=$(reason "$(cat "$WORK/err")")
      return 0
    fi
    _have=$(jq -r 'if (.gen|type) == "number" then .gen else empty end' "$WORK/m.json" 2>/dev/null)
    _node=$(jq -r 'if (.node|type) == "string" then .node else empty end' "$WORK/m.json" 2>/dev/null)
    if ! is_gen "$_have" || ! is_hex "$_node" 32; then
      _kind=marker
      _have=0
      _node=''
      return 0
    fi
    if [ "$_node" = "$NODE" ]; then
      _kind=ours
    elif [ "$_have" -le "$(incorporated "$(node8 "$_node")")" ]; then
      _kind=old
    else
      _kind=newer
    fi
  elif listed "$OBJECT"; then
    _kind=foreign
  fi
}

# Keep the current copy under $1 before replacing it, unless that record is
# already there. A server-side copy where the backend supports one.
keep_aside() {
  listed "$1" && return 0
  # shellcheck disable=SC2086
  rc --config "$RCONF" copyto "$_name:$_path/$OBJECT" "$_name:$_path/$1" $RCLONE_FLAGS $_extra 2>"$WORK/err"
}

# Upload $1 as $2 on the current target; the rclone output lands in $_out.
put() {
  # shellcheck disable=SC2086
  _out=$(rc --config "$RCONF" copyto "$1" "$_name:$_path/$2" $RCLONE_FLAGS $_extra --log-level NOTICE 2>&1)
}

# Delete this node's records beyond the newest $KEEP. Never another node's. The
# listing predates the record just uploaded, which is the newest of the $KEEP.
prune() {
  printf '%s\n' "$_list" | grep -xE "$OBJECT\.[0-9]{1,12}\.$NODE8" | sed "s/^$OBJECT\.//; s/\.$NODE8\$//" \
    | sort -rn | tail -n +"$KEEP" | while read -r _old; do
    # shellcheck disable=SC2086
    rc --config "$RCONF" deletefile "$_name:$_path/$OBJECT.$_old.$NODE8" $RCLONE_FLAGS $_extra 2>/dev/null \
      || log "[$_name] could not prune $OBJECT.$_old.$NODE8"
  done
}

# Upload a record of channel.backup, then the copy and marker that point at it,
# to every enabled target. Returns 0 only if all of them succeeded and the
# outcome was recorded, so a failing target keeps being retried.
ship() {
  _gen=$1
  _all_ok=0
  _any=0
  : > "$WORK/failures"
  remotes ship > "$WORK/remotes"
  while IFS= read -r _remote; do
    target "$_remote"
    if [ "$DEADLINE" -gt 0 ] && [ "$(date +%s)" -ge "$DEADLINE" ]; then
      fail_target "$_name" timeout ''
      _all_ok=1
      continue
    fi
    if [ "$_name" = sftp ]; then
      if [ "$(cfg '.sftp.hostKeyVerified // false')" != true ]; then
        fail_target sftp hostkey-unverified ''
        _all_ok=1
        continue
      fi
      if [ ! -s "$KNOWN_HOSTS" ]; then
        fail_target sftp hostkey ''
        _all_ok=1
        continue
      fi
    fi
    inspect_target
    case "$_kind" in
      unknown)
        fail_target "$_name" check "$_detail"
        _all_ok=1
        continue
        ;;
      marker)
        fail_target "$_name" marker ''
        _all_ok=1
        continue
        ;;
      newer)
        if [ "$FORCE" != 1 ]; then
          fail_target "$_name" newer "$_have"
          _all_ok=1
          continue
        fi
        if ! keep_aside "$OBJECT.$_have.$(node8 "$_node")"; then
          fail_target "$_name" archive "$(reason "$(cat "$WORK/err")")"
          _all_ok=1
          continue
        fi
        log "[$_name] kept the newer copy (gen=$_have) as $OBJECT.$_have.$(node8 "$_node")"
        ;;
      old)
        if ! keep_aside "$OBJECT.$_have.$(node8 "$_node")"; then
          fail_target "$_name" archive "$(reason "$(cat "$WORK/err")")"
          _all_ok=1
          continue
        fi
        ;;
      foreign)
        _aside="$OBJECT.unknown-$(date +%s)"
        if ! keep_aside "$_aside"; then
          fail_target "$_name" archive "$(reason "$(cat "$WORK/err")")"
          _all_ok=1
          continue
        fi
        log "[$_name] kept the copy found there as $_aside"
        ;;
    esac
    # Record first, marker last: the marker only ever names a complete record.
    if ! put "$BACKUP" "$OBJECT.$_gen.$NODE8" || ! put "$BACKUP" "$OBJECT" || ! put "$WORK/$META" "$META"; then
      fail_target "$_name" upload "$(reason "$_out")"
      _all_ok=1
      continue
    fi
    if [ "$_any" -eq 0 ]; then
      if ! write_atomic "$WATERMARK" "{\"gen\":$_gen}"; then
        fail_target "$_name" state ''
        _all_ok=1
        continue
      fi
      _any=1
    fi
    [ "$FORCE" = 1 ] || prune
  done < "$WORK/remotes"
  if ! publish_failures; then
    log "could not record the outcome"
    return 1
  fi
  return $_all_ok
}

# One cycle. Pass "force" to log the outcome even when nothing changed.
# Returns 0 ok, 1 a target failed, 3 no channel.backup yet, 4 no target
# enabled, 6 the settings could not be read.
do_backup() {
  mkdir -p "$WORK"
  snapshot_config || return 6
  if [ ! -s "$BACKUP" ]; then
    [ "$1" = force ] && log "no channel.backup yet: LND writes it when the first channel opens"
    [ "$(state_get '.failures // [] | length')" = 0 ] || state_merge '.failures = []' || log "could not clear the failures"
    return 3
  fi
  if [ -z "$(remotes ship)" ]; then
    [ "$1" = force ] && log "no backup target is enabled"
    return 4
  fi
  lock
  identify
  build_conf
  # Generations only ever grow, whatever the clock does.
  _gen=$(($(watermark_gen) + 1))
  _now=$(date +%s)
  [ "$_now" -gt "$_gen" ] && _gen=$_now
  printf '{"gen":%s,"node":"%s"}\n' "$_gen" "$NODE" > "$WORK/$META"
  _prev=$(state_get '.failures')
  if ship "$_gen"; then
    if ! state_merge --argjson g "$_gen" '.lastSuccess = $g'; then
      log "could not record the success"
      unlock
      return 1
    fi
    unlock
    if [ "$1" = force ] || { [ -n "$_prev" ] && [ "$_prev" != '[]' ]; }; then
      log "channel.backup shipped to every target (gen=$_gen)"
    fi
    return 0
  fi
  unlock
  # De-duplicated: an unchanged failure is logged once, not every retry.
  if [ "$1" = force ] || [ "$(state_get '.failures')" != "$_prev" ]; then
    log "channel backup failing — $(jq -r '.failures[] | "\(.target): \(.code) \(.detail)"' "$STATE" 2>/dev/null | tr '\n' ';')"
  fi
  return 1
}

# ---- restore ---------------------------------------------------------------
# Every copy that can be found is offered to restorechanbackup, one at a time,
# newest first: the newest record of every node that has written to a target,
# any copy left there without an identity, and the channel.backup the StartOS
# backup itself carried. LND skips channels it already knows, so the union is
# what gets recovered, and nothing is recorded until LND has answered. A copy
# is known by the hash of its bytes, so a rewritten channel.backup can never
# stand in for the record its marker names.
pull() {
  rm -f "$RESTORED"
  # shellcheck disable=SC2086
  if _out=$(rc --config "$RCONF" copyto "$_name:$_path/$1" "$RESTORED" $RCLONE_FLAGS $_extra 2>&1) && [ -s "$RESTORED" ]; then
    return 0
  fi
  rm -f "$RESTORED"
  return 1
}
sha() { sha256sum "$1" | cut -c1-64; }
tried() { case " $_tried " in *" $1 "*) return 0 ;; *) return 1 ;; esac; }
accepted_gen() {
  numor0 "$(jq -r --arg n "$1" '[.restoreAccepted[]? | select(.node == $n) | .gen] | max // 0' "$STATE" 2>/dev/null)"
}
offer() {
  jq -nc --arg d "$1" --arg f "$2" --arg h "$3" --arg n "$4" --arg g "$5" \
    '{dest:$d,file:$f,hash:$h,node:(if $n == "-" then null else $n end),gen:(if $g == "0" then null else ($g|tonumber) end)}' \
    > "$CANDIDATE" || die "cannot record the candidate"
  publish_failures || die "cannot record the outcome"
  log "candidate $2 from $1; restorechanbackup decides"
  exit 0
}

do_restore() {
  mkdir -p "$WORK"
  lock
  rm -f "$RESTORED" "$CANDIDATE"
  if ! restore_pending; then
    log "no pending restore"
    exit 3
  fi
  snapshot_config || die "channel-backup.json cannot be read"
  build_conf
  _tried=$(state_get '[.restoreAccepted[]?.hash, .restoreRejected[]?.hash] | .[]' | tr '\n' ' ')
  _incomplete=0
  : > "$WORK/failures"
  : > "$WORK/cands"
  remotes all > "$WORK/remotes"
  while IFS= read -r _remote; do
    target "$_remote"
    # shellcheck disable=SC2086
    _list=$(rc --config "$RCONF" lsf "$_name:$_path" --files-only $RCLONE_FLAGS $_extra 2>"$WORK/err")
    _rc=$?
    if [ "$_rc" -eq 3 ]; then
      log "[$_name] holds nothing"
      continue
    fi
    if [ "$_rc" -ne 0 ]; then
      _incomplete=1
      fail_target "$_name" check "$(reason "$(cat "$WORK/err")")"
      continue
    fi
    # Records are named <gen>.<node8>: the newest per node is that node's
    # whole channel set at the time. Copies with no identity come last.
    printf '%s\n' "$_list" | grep -xE "$OBJECT\.[0-9]{1,12}\.[0-9a-f]{8}" \
      | awk -F. '{ if ($3 + 0 > best[$4] + 0) { best[$4] = $3; name[$4] = $0 } } END { for (n in best) print best[n], n, name[n] }' \
      | while read -r _g _n _f; do printf '%s %s %s %s\n' "$_g" "$_n" "$_f" "$_remote" >> "$WORK/cands"; done
    printf '%s\n' "$_list" | grep -xE "$OBJECT\.unknown-[0-9]{1,12}" \
      | while read -r _f; do printf '0 - %s %s\n' "$_f" "$_remote" >> "$WORK/cands"; done
    listed "$OBJECT" && printf '0 - %s %s\n' "$OBJECT" "$_remote" >> "$WORK/cands"
  done < "$WORK/remotes"

  sort -rn "$WORK/cands" > "$WORK/cands.sorted"
  while read -r _g _n _f _remote; do
    if [ "$_n" != - ] && [ "$_g" -le "$(accepted_gen "$_n")" ]; then
      continue
    fi
    target "$_remote"
    if ! pull "$_f"; then
      _incomplete=1
      fail_target "$_name" pull "$(reason "$_out")"
      continue
    fi
    _h=$(sha "$RESTORED")
    if tried "$_h"; then
      rm -f "$RESTORED"
      continue
    fi
    offer "$_dest" "$_f" "$_h" "$_n" "$_g"
  done < "$WORK/cands.sorted"

  if [ -s "$BACKUP" ]; then
    _h=$(sha "$BACKUP")
    if ! tried "$_h"; then
      cp "$BACKUP" "$RESTORED" || die "cannot stage the StartOS backup's own copy"
      offer volume "$OBJECT" "$_h" - 0
    fi
  fi
  publish_failures || die "cannot record the outcome"
  if [ "$_incomplete" -eq 1 ]; then
    log "a target could not be consulted; the search is not over"
    exit 6
  fi
  log "every copy that could be found has been offered"
  exit 3
}

# restorechanbackup accepted the candidate: remember its hash, and for a record,
# that this node now holds everything that node had shipped up to that
# generation, so its older copies may be replaced.
commit_restore() {
  lock
  [ -s "$CANDIDATE" ] || die "no candidate to commit"
  _c=$(cat "$CANDIDATE")
  state_merge --argjson c "$_c" '
    .restoreAccepted = ((.restoreAccepted // []) + [$c])
    | if $c.node != null then .incorporated[$c.node] = ([.incorporated[$c.node] // 0, $c.gen] | max) else . end
  ' || die "cannot record the restore"
  rm -f "$RESTORED" "$CANDIDATE"
  log "restore accepted: $(printf '%s' "$_c" | jq -r '.file')"
}

reject_restore() {
  lock
  [ -s "$CANDIDATE" ] || die "no candidate to reject"
  _c=$(cat "$CANDIDATE")
  state_merge --argjson c "$_c" '.restoreRejected = ((.restoreRejected // []) + [{hash: $c.hash}])' || die "cannot record the rejection"
  rm -f "$RESTORED" "$CANDIDATE"
  log "restore refused: $(printf '%s' "$_c" | jq -r '.file') from $(printf '%s' "$_c" | jq -r '.dest')"
}

finish_restore() {
  lock
  state_merge '.restoreAccepted = [] | .restoreRejected = [] | .failures = []' || die "cannot record the end of the restore"
  rm -f "$RESTORED" "$CANDIDATE"
  log "restore finished"
}

# ---- watcher loop ----------------------------------------------------------
# The config is part of the identity, so a newly saved target ships at once.
fingerprint() {
  printf '%s|%s' "$(stat -c '%i:%s:%Y' "$BACKUP" 2>/dev/null)" "$(stat -c '%i:%s:%Y' "$CONFIG" 2>/dev/null)"
}

watch_loop() {
  trap 'exit 0' TERM INT
  mkdir -p "$WORK"
  log "started"
  _last=none
  _retry_at=0
  _last_ok=$(state_num '.lastSuccess')
  while :; do
    sleep "$POLL"
    [ -s "$BACKUP" ] || continue
    _fp=$(fingerprint)
    _now=$(date +%s)
    if [ "$_fp" = "$_last" ]; then
      if [ "$_retry_at" -gt 0 ] && [ "$_now" -ge "$_retry_at" ]; then :
      elif [ $((_now - _last_ok)) -ge "$BACKSTOP_SECS" ]; then :
      else continue; fi
    fi
    restore_pending && continue
    _last=$_fp
    do_backup normal
    case $? in
      0)
        _retry_at=0
        _last_ok=$_now
        ;;
      # A save was mid-write: look again on the next poll.
      6) _last=none ;;
      *) _retry_at=$((_now + RETRY_SECS)) ;;
    esac
  done
}

case "${1:-}" in
  --once)
    if restore_pending; then
      log "a restore is in progress; channel.backup is not sent until it completes"
      exit 2
    fi
    # Every rclone call is cut off at the run's deadline, and what did get
    # done is recorded; a run cut off anywhere leaves complete records and a
    # marker that names one of them.
    RCLONE_FLAGS="--contimeout=8s --timeout=20s --retries=1 --low-level-retries=1"
    FORCE=1
    DEADLINE=$(($(date +%s) + ONCE_SECS))
    do_backup force
    ;;
  --restore) do_restore ;;
  --commit-restore) commit_restore ;;
  --reject-restore) reject_restore ;;
  --finish-restore) finish_restore ;;
  *) watch_loop ;;
esac
