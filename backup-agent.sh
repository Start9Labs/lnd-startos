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
# Modes:
#   (default)         watcher daemon
#   --once            ship now (Back Up Channels Now). Exit 0 ok; 1 a target
#                     failed, see the state file; 2 restore pending; 3 no
#                     channel.backup yet; 4 no target enabled. A copy newer than
#                     anything this node has seen, which the watcher refuses, is
#                     archived on the target and replaced.
#   --restore         write the freshest untried candidate to $RESTORED and its
#                     generation to $CANDIDATE_GEN; exit 3 when there is none
#                     and the volume's own copy is to be used
#   --commit-restore  record what restorechanbackup accepted
#   --reject-restore  mark the current candidate as refused by LND
#
# Paths below MUST match startos/utils.ts.
set -u

LND_DIR=/root/.lnd
BACKUP="$LND_DIR/data/chain/bitcoin/mainnet/channel.backup"
RESTORED="$LND_DIR/channel.backup.restored"
CANDIDATE_GEN="$RESTORED.gen"
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

log() { echo "[channel-backup] $*" >&2; }

numor0() { case "$1" in '' | *[!0-9]*) echo 0 ;; *) echo "$1" ;; esac; }

# rclone logs several timestamped lines and this ends up in a health message,
# so keep the last one without its timestamp and level, and cap it.
reason() {
  printf '%s\n' "$1" | grep -v '^[[:space:]]*$' | tail -n 1 \
    | sed 's|^[0-9/]* [0-9:]* [A-Z]*: ||; s|^Failed to create file system for destination "[^"]*": ||' \
    | cut -c1-160
}

# Serializes the watcher, Back Up Channels Now and the restore steps across
# their subcontainers: two writers racing would let an older upload land after
# a newer one.
lock() {
  exec 9>>"$LOCK"
  flock -x 9
}
unlock() { flock -u 9; }

# ---- state helpers (atomic merge into STATE) -------------------------------
state_merge() {
  mkdir -p "$WORK"
  _tmp="$WORK/.state.$$"
  _cur='{}'
  [ -s "$STATE" ] && _cur=$(cat "$STATE" 2>/dev/null)
  [ -n "$_cur" ] || _cur='{}'
  if printf '%s' "$_cur" | jq "$@" > "$_tmp" 2>/dev/null; then
    mv "$_tmp" "$STATE"
  else
    rm -f "$_tmp"
  fi
}
state_get() { jq -r "$1 // empty" "$STATE" 2>/dev/null || true; }
state_num() { numor0 "$(state_get "$1")"; }

# Failures are "target, code, detail" records; the health check renders them.
fail_target() {
  jq -nc --arg t "$1" --arg c "$2" --arg d "$3" '{target:$t,code:$c,detail:$d}' >> "$WORK/failures"
}
publish_failures() {
  state_merge --argjson f "$(jq -sc . "$WORK/failures" 2>/dev/null || echo '[]')" '.failures = $f'
}

cfg() { jq -r "$1" "$CONFIG" 2>/dev/null; }

# One "provider:path" line per enabled target. Always consumed line by line: a
# folder name can contain spaces.
remotes() {
  for _p in gdrive dropbox nextcloud sftp; do
    [ "$(cfg ".$_p.enabled // false")" = true ] || continue
    _pp=$(cfg ".$_p.path // empty")
    [ -n "$_pp" ] || _pp=lnd-channel-backups
    printf '%s:%s\n' "$_p" "$_pp"
  done
}

# Sets $_name, $_path and $_extra for a "provider:path" line.
target() {
  _name=${1%%:*}
  _path=${1#*:}
  _extra=''
  [ "$(cfg ".$_name.insecureTls // false")" = true ] && _extra='--no-check-certificate'
}

# A restore is in flight: LND rewrites channel.backup from the restored channel
# set shortly after unlocking, and shipping that would overwrite the current
# copy on every target with an older one. The restore oneshot clears the flag
# once it has run.
restore_pending() {
  [ "$(jq -r '.restore // false' "$FLAGS" 2>/dev/null || echo false)" = true ]
}

# Build rclone.conf from the structured config: one section per enabled target.
# Passwords are stored plaintext in the config and obscured HERE, the only
# format rclone accepts, so the TS side never round-trips an obscure heuristic.
build_conf() {
  mkdir -p "$WORK"
  : > "$RCONF"
  if [ "$(cfg '.gdrive.enabled // false')" = true ]; then
    printf '[gdrive]\ntype = drive\nscope = drive\nclient_id = %s\nclient_secret = %s\ntoken = %s\n\n' \
      "$(cfg '.gdrive.clientId // empty')" "$(cfg '.gdrive.clientSecret // empty')" "$(cfg '.gdrive.token // empty')" >> "$RCONF"
  fi
  if [ "$(cfg '.dropbox.enabled // false')" = true ]; then
    printf '[dropbox]\ntype = dropbox\nclient_id = %s\nclient_secret = %s\ntoken = %s\n\n' \
      "$(cfg '.dropbox.clientId // empty')" "$(cfg '.dropbox.clientSecret // empty')" "$(cfg '.dropbox.token // empty')" >> "$RCONF"
  fi
  if [ "$(cfg '.nextcloud.enabled // false')" = true ]; then
    printf '[nextcloud]\ntype = webdav\nurl = %s\nvendor = nextcloud\nuser = %s\npass = %s\n\n' \
      "$(cfg '.nextcloud.url // empty')" "$(cfg '.nextcloud.user // empty')" \
      "$(rclone obscure "$(cfg '.nextcloud.pass // empty')")" >> "$RCONF"
  fi
  if [ "$(cfg '.sftp.enabled // false')" = true ]; then
    # The host keys recorded when the target was saved; rclone refuses any
    # other server presenting itself at that address.
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

# What the current target holds. Sets $_kind and, for a readable marker, $_have:
#   fresh    nothing there
#   ours     the generation this node last wrote there
#   old      older than something this node wrote or accepted from a restore
#   foreign  a channel.backup with no marker beside it
#   newer    past anything this node has seen: channels it does not know about
#   marker   a marker that cannot be parsed
#   unknown  the target could not be listed or read ($_detail says why)
inspect_target() {
  _have=0
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
  if printf '%s\n' "$_list" | grep -qx "$META"; then
    rm -f "$WORK/m.json"
    # shellcheck disable=SC2086
    if ! rclone --config "$RCONF" copyto "$_name:$_path/$META" "$WORK/m.json" $RCLONE_FLAGS $_extra 2>"$WORK/err"; then
      _kind=unknown
      _detail=$(reason "$(cat "$WORK/err")")
      return 0
    fi
    _have=$(numor0 "$(jq -r 'if (.gen|type) == "number" then .gen else empty end' "$WORK/m.json" 2>/dev/null)")
    if [ "$_have" -le 0 ]; then
      _kind=marker
      return 0
    fi
    _shipped=$(state_num ".shipped[\"$_name\"]")
    _incorporated=$(state_num '.incorporated')
    if [ "$_have" -eq "$_shipped" ]; then
      _kind=ours
    elif [ "$_have" -le "$_shipped" ] || [ "$_have" -le "$_incorporated" ]; then
      _kind=old
    else
      _kind=newer
    fi
  elif printf '%s\n' "$_list" | grep -qx "$OBJECT"; then
    _kind=foreign
  fi
}

# Keep a copy this node did not write, under a name that says which it was,
# before replacing it. A server-side copy where the backend supports one.
archive_target() {
  # shellcheck disable=SC2086
  rclone --config "$RCONF" copyto "$_name:$_path/$OBJECT" "$_name:$_path/$OBJECT.$1" $RCLONE_FLAGS $_extra 2>"$WORK/err" || return 1
  if printf '%s\n' "$_list" | grep -qx "$META"; then
    # shellcheck disable=SC2086
    rclone --config "$RCONF" copyto "$_name:$_path/$META" "$_name:$_path/$OBJECT.$1.meta" $RCLONE_FLAGS $_extra 2>>"$WORK/err" || return 1
  fi
}

# Upload channel.backup and its freshness marker to every enabled target.
# Returns 0 only if all of them succeeded, so a failing target keeps being
# retried. A target counts as shipped only once both files landed.
ship() {
  _gen=$1
  _all_ok=0
  : > "$WORK/failures"
  remotes > "$WORK/remotes"
  while IFS= read -r _remote; do
    target "$_remote"
    if [ "$_name" = sftp ] && [ ! -s "$KNOWN_HOSTS" ]; then
      fail_target sftp hostkey ''
      _all_ok=1
      continue
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
        if ! archive_target "$_have"; then
          fail_target "$_name" archive "$(reason "$(cat "$WORK/err")")"
          _all_ok=1
          continue
        fi
        log "[$_name] kept the newer copy (gen=$_have) as $OBJECT.$_have"
        ;;
      old | foreign)
        _suffix=$_have
        [ "$_kind" = foreign ] && _suffix="unknown-$(date +%s)"
        if ! archive_target "$_suffix"; then
          fail_target "$_name" archive "$(reason "$(cat "$WORK/err")")"
          _all_ok=1
          continue
        fi
        log "[$_name] kept the existing copy as $OBJECT.$_suffix"
        ;;
    esac
    # shellcheck disable=SC2086
    if ! _out=$(rclone --config "$RCONF" copyto "$BACKUP" "$_name:$_path/$OBJECT" $RCLONE_FLAGS $_extra --log-level NOTICE 2>&1); then
      fail_target "$_name" upload "$(reason "$_out")"
      _all_ok=1
      continue
    fi
    # shellcheck disable=SC2086
    if ! _out=$(rclone --config "$RCONF" copyto "$WORK/$META" "$_name:$_path/$META" $RCLONE_FLAGS $_extra --log-level NOTICE 2>&1); then
      fail_target "$_name" upload "$(reason "$_out")"
      _all_ok=1
      continue
    fi
    state_merge --arg t "$_name" --argjson g "$_gen" '.shipped[$t] = $g'
    printf '{"gen":%s}\n' "$_gen" > "$WATERMARK"
  done < "$WORK/remotes"
  publish_failures
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
  if [ -z "$(remotes)" ]; then
    [ "$1" = force ] && log "no backup target is enabled"
    return 4
  fi
  lock
  build_conf
  # Generations only ever grow, whatever the clock does.
  _gen=$(($(watermark_gen) + 1))
  _now=$(date +%s)
  [ "$_now" -gt "$_gen" ] && _gen=$_now
  printf '{"gen":%s}\n' "$_gen" > "$WORK/$META"
  _prev=$(state_get '.failures')
  if ship "$_gen"; then
    state_merge --argjson g "$_gen" '.lastSuccess = $g'
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
# skipping generations LND has already refused, and hand it to the restore
# oneshot. Nothing is recorded until restorechanbackup accepts it.
do_restore() {
  mkdir -p "$WORK"
  lock
  rm -f "$RESTORED" "$CANDIDATE_GEN"
  if ! restore_pending; then
    log "no pending restore"
    exit 3
  fi
  if [ -z "$(remotes)" ]; then
    log "no backup target configured; using the channel.backup from the StartOS backup"
    exit 3
  fi
  build_conf
  _floor=$(watermark_gen)
  _rejected=" $(state_get '.restoreRejected // [] | map(tostring) | join(" ")') "
  log "looking for a channel.backup newer than gen=$_floor"

  : > "$WORK/gens"
  remotes > "$WORK/remotes"
  while IFS= read -r _remote; do
    target "$_remote"
    if [ "$_name" = sftp ] && [ ! -s "$KNOWN_HOSTS" ]; then
      log "[sftp] no host key recorded; skipped"
      continue
    fi
    inspect_target
    case "$_kind" in
      fresh | foreign) log "[$_name] holds no comparable copy" ;;
      unknown | marker) log "[$_name] cannot be compared ($_kind${_detail:+: $_detail}); skipped, and never overwritten" ;;
      *)
        log "[$_name] available copy gen=$_have"
        printf '%s %s\n' "$_have" "$_remote" >> "$WORK/gens"
        ;;
    esac
  done < "$WORK/remotes"
  sort -rn "$WORK/gens" > "$WORK/gens.sorted"
  _best=$(numor0 "$(head -n1 "$WORK/gens.sorted" | cut -d' ' -f1)")

  if [ "$_best" -le "$_floor" ]; then
    log "newest comparable copy (gen=$_best) is not newer than the one in the StartOS backup (gen=$_floor); using the backup's copy"
    if [ "$_floor" -gt 0 ] && [ "$_best" -gt 0 ] && [ "$_best" -lt "$_floor" ]; then
      : > "$WORK/failures"
      _rb=$(head -n1 "$WORK/gens.sorted" | cut -d' ' -f2-)
      fail_target "${_rb%%:*}" rolled-back "$_best<$_floor"
      publish_failures
    fi
    exit 3
  fi

  while read -r _g _remote; do
    [ "$_g" -gt "$_floor" ] || continue
    case "$_rejected" in *" $_g "*)
      log "gen=$_g was refused by LND earlier; skipped"
      continue
      ;;
    esac
    target "$_remote"
    log "[$_name] pulling channel.backup (gen=$_g)"
    # shellcheck disable=SC2086
    if _out=$(rclone --config "$RCONF" copyto "$_name:$_path/$OBJECT" "$RESTORED" $RCLONE_FLAGS $_extra 2>&1) && [ -s "$RESTORED" ]; then
      printf '%s\n' "$_g" > "$CANDIDATE_GEN"
      log "[$_name] candidate gen=$_g written; restorechanbackup decides"
      exit 0
    fi
    log "[$_name] pull failed: $(reason "$_out")"
    rm -f "$RESTORED"
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
  if [ -s "$CANDIDATE_GEN" ]; then
    _g=$(numor0 "$(cat "$CANDIDATE_GEN")")
    [ "$_g" -gt "$_floor" ] && printf '{"gen":%s}\n' "$_g" > "$WATERMARK"
  fi
  state_merge --argjson g "$_g" '.incorporated = $g | .restoreRejected = []'
  rm -f "$RESTORED" "$CANDIDATE_GEN"
  log "restore committed at gen=$_g"
}

reject_restore() {
  lock
  if [ -s "$CANDIDATE_GEN" ]; then
    _g=$(numor0 "$(cat "$CANDIDATE_GEN")")
    state_merge --argjson g "$_g" '.restoreRejected = ((.restoreRejected // []) + [$g] | unique)'
    log "candidate gen=$_g marked as refused by LND"
  fi
  rm -f "$RESTORED" "$CANDIDATE_GEN"
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
    # Bounded to fit inside the action's budget; a hung target reports a timeout.
    RCLONE_FLAGS="--contimeout=10s --timeout=40s --retries=1 --low-level-retries=1"
    FORCE=1
    do_backup force
    ;;
  --restore) do_restore ;;
  --commit-restore) commit_restore ;;
  --reject-restore) reject_restore ;;
  *) watch_loop ;;
esac
