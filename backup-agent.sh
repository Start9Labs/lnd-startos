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
#   --once            ship now (Back Up Channels Now). Exit 0 ok; 1 a target
#                     failed, see the state file; 2 restore pending; 3 no
#                     channel.backup yet; 4 no target enabled; 5 another run
#                     holds the lock. A copy newer than anything this node has
#                     seen, which the watcher refuses, is kept and replaced.
#   --restore         write the freshest untried candidate to $RESTORED and its
#                     identity to $CANDIDATE; exit 3 when there is none and the
#                     volume's own copy is to be used
#   --commit-restore  record what restorechanbackup accepted
#   --reject-restore  mark the current candidate as refused by LND
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
RCLONE_FLAGS="--contimeout=15s --timeout=120s --retries=2 --low-level-retries=2"
FORCE=0
NODE=''
NODE8=''

log() { echo "[channel-backup] $*" >&2; }
die() {
  log "$*"
  exit 1
}

numor0() { case "$1" in '' | *[!0-9]*) echo 0 ;; *) echo "$1" ;; esac; }
node8() { printf '%s' "$1" | cut -c1-8; }

# rclone logs several timestamped lines and this ends up in a health message,
# so keep the last one without its timestamp and level, and cap it.
reason() {
  printf '%s\n' "$1" | grep -v '^[[:space:]]*$' | tail -n 1 \
    | sed 's|^[0-9/]* [0-9:]* [A-Z]*: ||; s|^Failed to create file system for destination "[^"]*": ||' \
    | cut -c1-160
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

# ---- state helpers (atomic merge into STATE) -------------------------------
# Returns non-zero when the merge could not be written; callers decide whether
# that is fatal.
state_merge() {
  mkdir -p "$WORK"
  [ -d "$STATE" ] && return 1
  _tmp="$WORK/.state.$$"
  _cur='{}'
  [ -s "$STATE" ] && _cur=$(cat "$STATE")
  [ -n "$_cur" ] || _cur='{}'
  if ! printf '%s' "$_cur" | jq "$@" > "$_tmp" 2>/dev/null; then
    rm -f "$_tmp"
    return 1
  fi
  mv -f "$_tmp" "$STATE" && [ -f "$STATE" ]
}
state_get() { jq -r "$1 // empty" "$STATE" 2>/dev/null || true; }
state_num() { numor0 "$(state_get "$1")"; }

# This node's identity, minted once. The state file is excluded from the StartOS
# backup, so a restored node gets a fresh one and never mistakes the copies of
# the node it was restored from for its own.
node_id() {
  _n=$(state_get '.node')
  if [ -z "$_n" ]; then
    _n=$(head -c 16 /dev/urandom | od -An -tx1 | tr -d ' \n')
    state_merge --arg n "$_n" '.node = $n' || die "cannot record the node id"
  fi
  printf '%s' "$_n"
}

# Failures are "target, code, detail" records; the health check renders them.
fail_target() {
  jq -nc --arg t "$1" --arg c "$2" --arg d "$3" '{target:$t,code:$c,detail:$d}' >> "$WORK/failures"
}
publish_failures() {
  state_merge --argjson f "$(jq -sc . "$WORK/failures" 2>/dev/null || echo '[]')" '.failures = $f'
}

cfg() { jq -r "$1" "$CONFIG" 2>/dev/null; }

# Whether a target's credentials are complete enough to reach it.
complete() {
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
      complete "$_p" || continue
    fi
    _pp=$(cfg ".$_p.path // empty")
    [ -n "$_pp" ] || _pp=lnd-channel-backups
    printf '%s:%s\n' "$_p" "$_pp"
  done
}

# Sets $_name, $_path, $_extra and $_dest for a "provider:path" line. $_dest
# names the destination, not the provider slot: shipped generations belong to
# a place, and editing the slot to point elsewhere must not carry them over.
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
  if complete gdrive; then
    printf '[gdrive]\ntype = drive\nscope = drive\nclient_id = %s\nclient_secret = %s\ntoken = %s\n\n' \
      "$(cfg '.gdrive.clientId // empty')" "$(cfg '.gdrive.clientSecret // empty')" "$(cfg '.gdrive.token // empty')" >> "$RCONF"
  fi
  if complete dropbox; then
    printf '[dropbox]\ntype = dropbox\nclient_id = %s\nclient_secret = %s\ntoken = %s\n\n' \
      "$(cfg '.dropbox.clientId // empty')" "$(cfg '.dropbox.clientSecret // empty')" "$(cfg '.dropbox.token // empty')" >> "$RCONF"
  fi
  if complete nextcloud; then
    printf '[nextcloud]\ntype = webdav\nurl = %s\nvendor = nextcloud\nuser = %s\npass = %s\n\n' \
      "$(cfg '.nextcloud.url // empty')" "$(cfg '.nextcloud.user // empty')" \
      "$(rclone obscure "$(cfg '.nextcloud.pass // empty')")" >> "$RCONF"
  fi
  if complete sftp; then
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

# Newest generation this node has shipped to any target or accepted from a
# restore; 0 before the first. Rides inside the StartOS backup, so a restore
# can compare targets against the copy the backup itself carries.
watermark_gen() { numor0 "$(jq -r '.gen // 0' "$WATERMARK" 2>/dev/null || echo 0)"; }

listed() { printf '%s\n' "$_list" | grep -qx "$1"; }

# What the current target holds. Sets $_kind and, for a readable marker, $_have
# and $_node:
#   fresh    nothing there
#   ours     this node's marker: a record of ours is current
#   old      another node's marker, at or below what this node has accepted
#   foreign  a channel.backup with no marker beside it
#   newer    another node's marker past anything this node has seen: channels
#            it does not know about
#   marker   a marker that cannot be parsed
#   unknown  the target could not be listed or read ($_detail says why)
inspect_target() {
  _have=0
  _node=''
  _kind=fresh
  _detail=''
  # shellcheck disable=SC2086
  _list=$(rclone --config "$RCONF" lsf "$_name:$_path" --files-only $RCLONE_FLAGS $_extra 2>"$WORK/err")
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
    if ! rclone --config "$RCONF" copyto "$_name:$_path/$META" "$WORK/m.json" $RCLONE_FLAGS $_extra 2>"$WORK/err"; then
      _kind=unknown
      _detail=$(reason "$(cat "$WORK/err")")
      return 0
    fi
    _have=$(numor0 "$(jq -r 'if (.gen|type) == "number" then .gen else empty end' "$WORK/m.json" 2>/dev/null)")
    _node=$(jq -r 'if (.node|type) == "string" then .node else empty end' "$WORK/m.json" 2>/dev/null)
    if [ "$_have" -le 0 ] || [ -z "$_node" ]; then
      _kind=marker
      return 0
    fi
    if [ "$_node" = "$NODE" ]; then
      _kind=ours
    elif [ "$_have" -le "$(state_num '.incorporated')" ]; then
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
  rclone --config "$RCONF" copyto "$_name:$_path/$OBJECT" "$_name:$_path/$1" $RCLONE_FLAGS $_extra 2>"$WORK/err"
}

# Upload $1 as $2 on the current target; the rclone output lands in $_out.
put() {
  # shellcheck disable=SC2086
  _out=$(rclone --config "$RCONF" copyto "$1" "$_name:$_path/$2" $RCLONE_FLAGS $_extra --log-level NOTICE 2>&1)
}

# Delete this node's records beyond the newest $KEEP. Never another node's.
prune() {
  printf '%s\n' "$_list" | grep -x "$OBJECT\.[0-9]*\.$NODE8" | sed "s/^$OBJECT\.//; s/\.$NODE8\$//" \
    | sort -rn | tail -n +"$KEEP" | while read -r _old; do
    # shellcheck disable=SC2086
    rclone --config "$RCONF" deletefile "$_name:$_path/$OBJECT.$_old.$NODE8" $RCLONE_FLAGS $_extra 2>/dev/null \
      || log "[$_name] could not prune $OBJECT.$_old.$NODE8"
  done
}

# Upload a record of channel.backup, then the copy and marker that point at it,
# to every enabled target. Returns 0 only if all of them succeeded, so a
# failing target keeps being retried.
ship() {
  _gen=$1
  _all_ok=0
  : > "$WORK/failures"
  remotes ship > "$WORK/remotes"
  while IFS= read -r _remote; do
    target "$_remote"
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
    if ! state_merge --arg d "$_dest" --argjson g "$_gen" '.shipped[$d] = $g'; then
      fail_target "$_name" state ''
      _all_ok=1
      continue
    fi
    printf '{"gen":%s}\n' "$_gen" > "$WATERMARK"
    [ "$FORCE" = 1 ] || prune
  done < "$WORK/remotes"
  publish_failures || log "could not record the failures"
  return $_all_ok
}

# One cycle. Pass "force" to log the outcome even when nothing changed.
# Returns 0 ok, 1 a target failed, 3 no channel.backup yet, 4 no target enabled.
do_backup() {
  mkdir -p "$WORK"
  if [ ! -s "$BACKUP" ]; then
    [ "$1" = force ] && log "no channel.backup yet: LND writes it when the first channel opens"
    return 3
  fi
  if [ -z "$(remotes ship)" ]; then
    [ "$1" = force ] && log "no backup target is enabled"
    return 4
  fi
  lock
  NODE=$(node_id)
  NODE8=$(node8 "$NODE")
  build_conf
  # Generations only ever grow, whatever the clock does.
  _gen=$(($(watermark_gen) + 1))
  _now=$(date +%s)
  [ "$_now" -gt "$_gen" ] && _gen=$_now
  printf '{"gen":%s,"node":"%s"}\n' "$_gen" "$NODE" > "$WORK/$META"
  _prev=$(state_get '.failures')
  if ship "$_gen"; then
    state_merge --argjson g "$_gen" '.lastSuccess = $g' || log "could not record the success"
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
# Pick the freshest copy newer than the watermark the StartOS backup carried,
# skipping candidates LND has already refused, and hand it to the restore
# oneshot. Nothing is recorded until restorechanbackup accepts it.
pull() {
  # shellcheck disable=SC2086
  if _out=$(rclone --config "$RCONF" copyto "$_name:$_path/$1" "$RESTORED" $RCLONE_FLAGS $_extra 2>&1) && [ -s "$RESTORED" ]; then
    return 0
  fi
  rm -f "$RESTORED"
  return 1
}

do_restore() {
  mkdir -p "$WORK"
  lock
  NODE=$(node_id)
  NODE8=$(node8 "$NODE")
  rm -f "$RESTORED" "$CANDIDATE"
  if ! restore_pending; then
    log "no pending restore"
    exit 3
  fi
  if [ -z "$(remotes all)" ]; then
    log "no reachable backup target configured; using the channel.backup from the StartOS backup"
    exit 3
  fi
  build_conf
  _floor=$(watermark_gen)
  _rejected=" $(state_get '.restoreRejected // [] | join(" ")') "
  log "looking for a channel.backup newer than gen=$_floor"

  : > "$WORK/gens"
  remotes all > "$WORK/remotes"
  while IFS= read -r _remote; do
    target "$_remote"
    inspect_target
    case "$_kind" in
      fresh | foreign) log "[$_name] holds no comparable copy" ;;
      unknown | marker) log "[$_name] cannot be compared ($_kind${_detail:+: $_detail}); skipped, and never overwritten" ;;
      *)
        log "[$_name] available copy gen=$_have"
        printf '%s %s %s %s\n' "$_have" "$_node" "$_dest" "$_remote" >> "$WORK/gens"
        ;;
    esac
  done < "$WORK/remotes"
  sort -rn "$WORK/gens" > "$WORK/gens.sorted"
  _best=$(numor0 "$(head -n1 "$WORK/gens.sorted" | cut -d' ' -f1)")

  if [ "$_best" -le "$_floor" ]; then
    log "newest comparable copy (gen=$_best) is not newer than the one in the StartOS backup (gen=$_floor); using the backup's copy"
    if [ "$_floor" -gt 0 ] && [ "$_best" -gt 0 ] && [ "$_best" -lt "$_floor" ]; then
      : > "$WORK/failures"
      _rb=$(head -n1 "$WORK/gens.sorted" | cut -d' ' -f4-)
      fail_target "${_rb%%:*}" rolled-back "$_best<$_floor"
      publish_failures || log "could not record the rollback"
    fi
    exit 3
  fi

  while read -r _g _n _d _remote; do
    [ "$_g" -gt "$_floor" ] || continue
    _cid="$_d:$_g:$_n"
    case "$_rejected" in *" $_cid "*)
      log "candidate $_cid was refused by LND earlier; skipped"
      continue
      ;;
    esac
    target "$_remote"
    log "[$_name] pulling channel.backup (gen=$_g)"
    if pull "$OBJECT.$_g.$(node8 "$_n")" || pull "$OBJECT"; then
      printf '%s\n' "$_cid" > "$CANDIDATE" || die "cannot record the candidate"
      log "[$_name] candidate gen=$_g written; restorechanbackup decides"
      exit 0
    fi
    log "[$_name] pull failed: $(reason "$_out")"
  done < "$WORK/gens.sorted"

  log "no candidate could be pulled; using the channel.backup from the StartOS backup"
  exit 3
}

# restorechanbackup accepted the candidate, or the volume's own copy when there
# was none. From here on, copies up to that generation may be replaced.
commit_restore() {
  lock
  _floor=$(watermark_gen)
  _g=$_floor
  if [ -s "$CANDIDATE" ]; then
    _g=$(numor0 "$(awk -F: '{print $(NF-1)}' "$CANDIDATE")")
    if [ "$_g" -gt "$_floor" ]; then
      printf '{"gen":%s}\n' "$_g" > "$WATERMARK" || die "cannot write the watermark"
    fi
  fi
  state_merge --argjson g "$_g" '.incorporated = $g | .restoreRejected = []' || die "cannot record the restore"
  rm -f "$RESTORED" "$CANDIDATE"
  log "restore committed at gen=$_g"
}

reject_restore() {
  lock
  [ -s "$CANDIDATE" ] || die "no candidate to reject"
  _cid=$(cat "$CANDIDATE")
  state_merge --arg c "$_cid" '.restoreRejected = ((.restoreRejected // []) + [$c] | unique)' || die "cannot record the rejection"
  rm -f "$RESTORED" "$CANDIDATE"
  log "candidate $_cid marked as refused by LND"
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
    if do_backup normal; then
      _retry_at=0
      _last_ok=$_now
    else
      _retry_at=$((_now + RETRY_SECS))
    fi
  done
}

case "${1:-}" in
  --once)
    if restore_pending; then
      log "a restore is in progress; channel.backup is not sent until it completes"
      exit 2
    fi
    # Bounded to fit inside the action's budget; a hung target reports a
    # timeout. A run cut off anywhere leaves complete records and a marker that
    # names one of them.
    RCLONE_FLAGS="--contimeout=8s --timeout=20s --retries=1 --low-level-retries=1"
    FORCE=1
    do_backup force
    ;;
  --restore) do_restore ;;
  --commit-restore) commit_restore ;;
  --reject-restore) reject_restore ;;
  *) watch_loop ;;
esac
