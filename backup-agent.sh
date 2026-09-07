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
#   (default)   long-running watcher (the channel-backup daemon)
#   --once      ship immediately and exit (the Back Up Channels Now action)
#   --restore   pull the freshest copy to $RESTORED and exit (restore-pull)
#
# Paths below MUST match startos/utils.ts.
set -u

LND_DIR=/root/.lnd
BACKUP="$LND_DIR/data/chain/bitcoin/mainnet/channel.backup"
RESTORED="$LND_DIR/channel.backup.restored"
CONFIG="$LND_DIR/channel-backup.json"
FLAGS="$LND_DIR/startup-flags.json"
STATE="$LND_DIR/.channel-backup-state.json"
WATERMARK="$LND_DIR/channel-backup-watermark.json"

WORK=/tmp/lnd-channel-backup
RCONF="$WORK/rclone.conf"
OBJECT=channel.backup
META=channel.backup.meta

# channel.backup changes a handful of times a day, so polling its identity is
# enough and survives the temp-file-then-rename LND writes it with — a watch on
# the inode does not.
POLL=10
RETRY_SECS=300
RCLONE_FLAGS="--contimeout=15s --timeout=120s --retries=2 --low-level-retries=2"

log() { echo "[channel-backup] $*" >&2; }

numor0() { case "$1" in '' | *[!0-9]*) echo 0 ;; *) echo "$1" ;; esac; }

# ---- state helpers (atomic merge into STATE) -------------------------------
state_merge() {
  mkdir -p "$WORK"
  _tmp="$WORK/.state.$$"
  _cur='{}'
  [ -s "$STATE" ] && _cur=$(cat "$STATE" 2>/dev/null)
  [ -n "$_cur" ] || _cur='{}'
  printf '%s' "$_cur" | jq "$@" > "$_tmp" 2>/dev/null && mv "$_tmp" "$STATE" || rm -f "$_tmp"
}
state_set_str() { state_merge --arg v "$2" ". + {\"$1\": \$v}"; }
state_set_num() { state_merge --argjson v "$2" ". + {\"$1\": \$v}"; }
state_clear() { state_merge "del(.$1)"; }
state_get() { jq -r ".$1 // empty" "$STATE" 2>/dev/null || true; }

cfg() { jq -r "$1" "$CONFIG" 2>/dev/null; }

# "provider:path" for each enabled target.
remotes() {
  for _p in gdrive dropbox nextcloud sftp; do
    [ "$(cfg ".$_p.enabled // false")" = true ] || continue
    _pp=$(cfg ".$_p.path // empty")
    [ -n "$_pp" ] || _pp=lnd-channel-backups
    printf '%s:%s\n' "$_p" "$_pp"
  done
}

# A target the user marked as trusting a self-signed certificate. The file is
# already encrypted by LND, so skipping verification only ever exposes
# ciphertext. Echoes the rclone flag to add, or nothing.
tls_flag() {
  [ "$(cfg ".$1.insecureTls // false")" = true ] && printf '%s' '--no-check-certificate'
}

# A restore is in flight: LND rewrites channel.backup from the restored (stale)
# channel set shortly after unlocking, and shipping that would overwrite the
# current copy on every target with an older one. The restore oneshot clears the
# flag once it has run.
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
    {
      printf '[sftp]\ntype = sftp\nhost = %s\nuser = %s\nkey_use_agent = false\nport = %s\nset_modtime = false\n' \
        "$(cfg '.sftp.host // empty')" "$(cfg '.sftp.user // empty')" "$(cfg '.sftp.port // "22"')"
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

# Upload channel.backup and its freshness marker to every enabled target.
# Returns 0 only if all of them succeeded, so a failing target keeps being
# retried. Each failure reason goes to $WORK/failures as "<name>: <reason>" so
# the health check can name the target instead of saying "one or more failed".
ship() {
  _gen=$1
  _all_ok=0
  : > "$WORK/failures"
  for _remote in $(remotes); do
    _name=$(echo "$_remote" | cut -d: -f1)
    _path=$(echo "$_remote" | cut -d: -f2-)
    _extra=$(tls_flag "$_name")
    # shellcheck disable=SC2086
    if _out=$(rclone --config "$RCONF" copyto "$BACKUP" "$_name:$_path/$OBJECT" $RCLONE_FLAGS $_extra --log-level NOTICE 2>&1); then
      # shellcheck disable=SC2086
      rclone --config "$RCONF" copyto "$WORK/$META" "$_name:$_path/$META" $RCLONE_FLAGS $_extra 2>/dev/null \
        || log "[$_name] backup shipped but the freshness marker failed"
    else
      # rclone logs several timestamped lines and this ends up as a health
      # message, so keep the last one without its timestamp and level, and cap
      # it.
      _reason=$(echo "$_out" | grep -v '^[[:space:]]*$' | tail -n 1 \
        | sed 's|^[0-9/]* [0-9:]* [A-Z]*: ||; s|^Failed to create file system for destination "[^"]*": ||' \
        | cut -c1-120)
      [ -n "$_reason" ] || _reason='upload failed'
      printf '%s: %s\n' "$_name" "$_reason" >> "$WORK/failures"
      _all_ok=1
    fi
  done
  return $_all_ok
}

# One cycle. Pass "force" to log the outcome even when nothing changed.
do_backup() {
  mkdir -p "$WORK"
  if [ ! -s "$BACKUP" ]; then
    log "no channel.backup yet (no channels)"
    return 0
  fi
  if [ -z "$(remotes)" ]; then
    state_set_str lastError "No backup target is configured"
    [ "$1" = force ] && log "no backup target is configured"
    return 1
  fi
  build_conf
  # Generation = ship time. Restore picks the target with the highest one.
  _gen=$(date +%s)
  printf '{"gen":%s}\n' "$_gen" > "$WORK/$META"
  _prev_error=$(state_get lastError)
  if ship "$_gen"; then
    state_set_num lastSuccess "$_gen"
    state_clear lastError
    printf '{"gen":%s}\n' "$_gen" > "$WATERMARK"
    if [ "$1" = force ] || [ -n "$_prev_error" ]; then
      log "channel.backup shipped to every target (gen=$_gen)"
    fi
    return 0
  fi
  _err=$(awk 'NR>1{printf "; "}{printf "%s",$0}' "$WORK/failures" 2>/dev/null)
  [ -n "$_err" ] || _err='one or more backup targets failed'
  # De-duplicated: an unchanged failure is logged once, not every retry.
  if [ "$1" = force ] || [ "$_err" != "$_prev_error" ]; then
    log "channel backup failing — $_err"
  fi
  state_set_str lastError "$_err"
  return 1
}

# ---- restore: fetch the freshest copy before restorechanbackup runs ---------
# Writes $RESTORED only when a target is strictly newer than the watermark the
# StartOS backup carried. Otherwise it writes nothing and the restore falls back
# to the channel.backup already in the volume, which is what happens today.
do_restore() {
  mkdir -p "$WORK"
  rm -f "$RESTORED"
  if ! restore_pending; then
    log "no pending restore"
    exit 0
  fi
  if [ -z "$(remotes)" ]; then
    log "no backup target configured; using the channel.backup from the StartOS backup"
    exit 0
  fi
  build_conf
  _floor=$(numor0 "$(jq -r '.gen // 0' "$WATERMARK" 2>/dev/null || echo 0)")
  log "looking for a channel.backup newer than gen=$_floor"

  : > "$WORK/gens"
  for _remote in $(remotes); do
    _name=$(echo "$_remote" | cut -d: -f1)
    _path=$(echo "$_remote" | cut -d: -f2-)
    _extra=$(tls_flag "$_name")
    rm -f "$WORK/m.json"
    # shellcheck disable=SC2086
    if rclone --config "$RCONF" copyto "$_name:$_path/$META" "$WORK/m.json" $RCLONE_FLAGS $_extra 2>/dev/null; then
      _g=$(numor0 "$(jq -r '.gen // 0' "$WORK/m.json" 2>/dev/null || echo 0)")
    else
      _g=0 # unreachable, or shipped before markers existed
    fi
    log "[$_name] available copy gen=$_g"
    echo "$_g $_remote" >> "$WORK/gens"
  done
  if [ ! -s "$WORK/gens" ]; then
    log "no reachable target; using the channel.backup from the StartOS backup"
    exit 0
  fi
  sort -rn "$WORK/gens" > "$WORK/gens.sorted"
  _best=$(numor0 "$(head -n1 "$WORK/gens.sorted" | awk '{print $1}')")

  if [ "$_best" -le "$_floor" ]; then
    log "newest target copy (gen=$_best) is not newer than the one in the StartOS backup (gen=$_floor); using the backup's copy"
    if [ "$_floor" -gt 0 ] && [ "$_best" -gt 0 ] && [ "$_best" -lt "$_floor" ]; then
      state_set_str lastError "A backup target looks rolled back: its newest channel.backup (gen=$_best) is older than the one this node last shipped (gen=$_floor). The restore used the copy from the StartOS backup instead."
    fi
    exit 0
  fi

  while read -r _g _remote; do
    [ "$_g" -gt "$_floor" ] || continue
    _name=$(echo "$_remote" | cut -d: -f1)
    _path=$(echo "$_remote" | cut -d: -f2-)
    _extra=$(tls_flag "$_name")
    log "[$_name] pulling channel.backup (gen=$_g)"
    # shellcheck disable=SC2086
    if _out=$(rclone --config "$RCONF" copyto "$_name:$_path/$OBJECT" "$RESTORED" $RCLONE_FLAGS $_extra 2>&1); then
      if [ -s "$RESTORED" ]; then
        log "[$_name] restored channel.backup (gen=$_g); it will be used instead of the copy from the StartOS backup"
        exit 0
      fi
      log "[$_name] pulled an empty file"
      rm -f "$RESTORED"
    else
      log "[$_name] pull failed: $(echo "$_out" | tail -n 2 | tr '\n' ' ')"
      rm -f "$RESTORED"
    fi
  done < "$WORK/gens.sorted"

  log "no target could be pulled; using the channel.backup from the StartOS backup"
  exit 0
}

# ---- watcher loop ----------------------------------------------------------
fingerprint() { stat -c '%i:%s:%Y' "$BACKUP" 2>/dev/null || echo none; }

watch_loop() {
  trap 'exit 0' TERM INT
  mkdir -p "$WORK"
  log "started"
  _last=none
  _retry_at=0
  while :; do
    sleep "$POLL"
    [ -s "$BACKUP" ] || continue
    restore_pending && continue
    _fp=$(fingerprint)
    _now=$(date +%s)
    if [ "$_fp" != "$_last" ]; then
      _last=$_fp
      if do_backup normal; then
        _retry_at=0
      else
        _retry_at=$((_now + RETRY_SECS))
      fi
    elif [ "$_retry_at" -gt 0 ] && [ "$_now" -ge "$_retry_at" ]; then
      if do_backup retry; then
        _retry_at=0
      else
        _retry_at=$((_now + RETRY_SECS))
      fi
    fi
  done
}

case "${1:-}" in
  --once) do_backup force ;;
  --restore) do_restore ;;
  *) watch_loop ;;
esac
