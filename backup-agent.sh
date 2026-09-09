#!/bin/sh
# Continuous off-box copy of LND's static channel backup.
#
# LND rewrites channel.backup whenever the channel set changes, and encrypts
# its contents under a key derived from the wallet seed. The file is shipped
# as-is, without another client-side encryption layer.
#
# A StartOS backup also carries channel.backup, but it is point-in-time, so
# channels opened since the last one are missing from it. This agent is what
# keeps an off-box copy current between those backups.
#
# What a target holds:
#   channel.backup                 the newest copy, for a person to find
#   channel.backup.meta            {"gen":G,"node":N}: which record is current
#   channel.backup.<G>.<N>         one generation-addressed immutable record;
#                                  the newest $KEEP of this node's are kept
#   channel.backup.unknown-<time>  a copy found with no marker, kept aside
# Remote metadata and credentials are plaintext. Backup records remain LND's
# seed-encrypted ciphertext. Each remote name is published by atomic rename.
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
umask 077

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
MAX_SCB_BYTES=$((16 * 1024 * 1024))
MAX_MARKER_BYTES=4096
MAX_LIST_BYTES=$((2 * 1024 * 1024))
MAX_CONFIG_BYTES=$((256 * 1024))

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
SNAPSHOT=''

log() { echo "[channel-backup] $*" >&2; }
die() {
  log "$*"
  exit 1
}

numor0() { case "$1" in '' | *[!0-9]*) echo 0 ;; *) echo "$1" ;; esac; }
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
  printf '%s\n' "$1" | tr -d '\000-\010\013\014\016-\037\177' \
    | grep -v '^[[:space:]]*$' | tail -n 1 \
    | sed 's|^[0-9/]* [0-9:]* [A-Z]*: ||; s|^Failed to create file system for destination "[^"]*": ||' \
    | cut -c1-160
}
reason_file() { tail -c 8192 "$1" 2>/dev/null | reason; }

# rclone, cut off at the run's deadline when there is one.
rc() {
  if [ "$DEADLINE" -gt 0 ]; then
    _left=$((DEADLINE - $(date +%s)))
    if [ "$_left" -le 0 ]; then
      echo "out of time" >&2
      return 124
    fi
    timeout -k 5 "$_left" rclone "$@"
    _r=$?
    { [ "$_r" -eq 124 ] || [ "$_r" -eq 143 ]; } && echo "timed out" >&2
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
publish_file() {
  sync -f "$1" || return 1
  mv -f "$1" "$2" || return 1
  sync -f "$(dirname "$2")"
}
write_atomic() {
  _tmp="$1.tmp.$$"
  printf '%s\n' "$2" > "$_tmp" || return 1
  publish_file "$_tmp" "$1" || { rm -f "$_tmp"; return 1; }
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
incorporated() {
  _inc=$(numor0 "$(state_get ".incorporated[\"$1\"]")")
  if [ "$_inc" -eq 0 ] && is_hex "$1" 32; then
    _legacy=$(printf '%s' "$1" | cut -c1-8)
    _inc=$(numor0 "$(state_get ".incorporated[\"$_legacy\"]")")
  fi
  printf '%s\n' "$_inc"
}

# One validated copy of the settings per run, so a save landing mid-run cannot
# mix two configurations. A half-written file is not valid JSON and is retried.
snapshot_config() {
  mkdir -p "$WORK" || return 1
  if [ -e "$CONFIG" ]; then
    _size=$(wc -c < "$CONFIG") || return 1
    [ "$_size" -le "$MAX_CONFIG_BYTES" ] || return 1
    if ! jq -ce . "$CONFIG" > "$CONFIG_SNAP.tmp" 2>/dev/null; then
      rm -f "$CONFIG_SNAP.tmp"
      return 1
    fi
  else
    printf '{}\n' > "$CONFIG_SNAP.tmp" || return 1
  fi
  publish_file "$CONFIG_SNAP.tmp" "$CONFIG_SNAP" || return 1
  validate_config
}
validate_config() {
  jq -e '
    def line($n):
      type == "string" and length <= $n and
      (test("[\\x00-\\x1f\\x7f]") | not);
    def maybe_line($n): . == null or line($n);
    def path:
      line(2048) and
      (startswith("/") or startswith("\\") | not) and
      ((split("/") + split("\\")) | index("..") == null);
    def oauth:
      . == null or (
        type == "object" and (.enabled | type == "boolean") and
        (.clientId | line(2048)) and
        (.clientSecret | line(16384)) and
        (.token | maybe_line(65536)) and
        (.token == null or (.token | try (fromjson | type == "object") catch false)) and
        (.path | path)
      );
    def nextcloud:
      . == null or (
        type == "object" and (.enabled | type == "boolean") and
        (.url | line(2048)) and
        (.url == "" or (.url | test("^https://"; "i"))) and
        (.user | line(2048)) and (.pass | maybe_line(16384)) and
        (.insecureTls | type == "boolean") and (.path | path)
      );
    def key_pem:
      . == null or (
        line(32768) and
        test("^-----BEGIN OPENSSH PRIVATE KEY-----\\\\n([A-Za-z0-9+/=]{1,70}\\\\n)+-----END OPENSSH PRIVATE KEY-----$")
      );
    def known_hosts:
      . == null or (
        type == "string" and length <= 65536 and
        (split("\n") | all(.[];
          test("^\\S+ (ssh-(rsa|ed25519|dss)|ecdsa-sha2-nistp(256|384|521)|sk-\\S+) [A-Za-z0-9+/]+={0,2}$")
        ))
      );
    def sftp:
      . == null or (
        type == "object" and (.enabled | type == "boolean") and
        (.host | line(2048)) and (.host | startswith("-") | not) and
        (.user | line(2048)) and
        (.port | type == "string" and test("^[0-9]{1,5}$") and
          (tonumber >= 1 and tonumber <= 65535)) and
        (.authType == "password" or .authType == "key") and
        (.pass | maybe_line(16384)) and (.keyPem | key_pem) and
        (.knownHosts | known_hosts) and
        (.hostKeyFingerprints | type == "string" and length <= 16384) and
        (.hostKeyVerified | type == "boolean") and (.path | path)
      );
    (.gdrive | oauth) and (.dropbox | oauth) and
    (.nextcloud | nextcloud) and (.sftp | sftp)
  ' "$CONFIG_SNAP" >/dev/null 2>&1
}
config_fingerprint() { sha256sum "$CONFIG_SNAP" | cut -c1-64; }
config_unchanged() {
  _check="$WORK/config.check.$$"
  if [ -e "$CONFIG" ]; then
    jq -ce . "$CONFIG" > "$_check" 2>/dev/null || { rm -f "$_check"; return 1; }
  else
    printf '{}\n' > "$_check" || return 1
  fi
  cmp -s "$CONFIG_SNAP" "$_check"
  _same=$?
  rm -f "$_check"
  return "$_same"
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
}

# Failures are "target, code, detail" records; the health check renders them.
fail_target() {
  jq -nc --arg t "$1" --arg c "$2" --arg d "$3" '{target:$t,code:$c,detail:$d}' >> "$WORK/failures" \
    || die "cannot record a target failure"
}
publish_failures() {
  _failures=$(jq -sc . "$WORK/failures" 2>/dev/null) || return 1
  state_merge --argjson f "$_failures" '.failures = $f'
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
    printf '%s:%s\n' "$_p" "$_pp" || return 1
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
  [ -e "$FLAGS" ] || return 1
  _pending=$(jq -er 'if (.restore == true) then "true" elif (.restore == false or .restore == null) then "false" else error("invalid restore flag") end' "$FLAGS" 2>/dev/null) || return 2
  [ "$_pending" = true ]
}

# Build rclone.conf from the structured config: one section per target with
# complete credentials, enabled or not. Passwords are stored plaintext in the
# config and obscured HERE, the only format rclone accepts, so the TS side
# never round-trips an obscure heuristic.
build_conf() {
  mkdir -p "$WORK" || return 1
  : > "$RCONF" || return 1
  if has_creds gdrive; then
    printf '[gdrive]\ntype = drive\nscope = drive.file\nclient_id = %s\nclient_secret = %s\ntoken = %s\n\n' \
      "$(cfg '.gdrive.clientId // empty')" "$(cfg '.gdrive.clientSecret // empty')" "$(cfg '.gdrive.token // empty')" >> "$RCONF" || return 1
  fi
  if has_creds dropbox; then
    printf '[dropbox]\ntype = dropbox\nclient_id = %s\nclient_secret = %s\ntoken = %s\n\n' \
      "$(cfg '.dropbox.clientId // empty')" "$(cfg '.dropbox.clientSecret // empty')" "$(cfg '.dropbox.token // empty')" >> "$RCONF" || return 1
  fi
  if has_creds nextcloud; then
    _obscured=$(rclone obscure "$(cfg '.nextcloud.pass // empty')") || return 1
    printf '[nextcloud]\ntype = webdav\nurl = %s\nvendor = nextcloud\nuser = %s\npass = %s\n\n' \
      "$(cfg '.nextcloud.url // empty')" "$(cfg '.nextcloud.user // empty')" "$_obscured" >> "$RCONF" || return 1
  fi
  if has_creds sftp; then
    # The host keys recorded when the target was saved and confirmed by the
    # user; rclone refuses any other server presenting itself at that address.
    cfg '.sftp.knownHosts // empty' > "$KNOWN_HOSTS" || return 1
    {
      printf '[sftp]\ntype = sftp\nhost = %s\nuser = %s\nkey_use_agent = false\nport = %s\nset_modtime = false\nknown_hosts_file = %s\n' \
        "$(cfg '.sftp.host // empty')" "$(cfg '.sftp.user // empty')" "$(cfg '.sftp.port // "22"')" "$KNOWN_HOSTS"
      if [ "$(cfg '.sftp.authType // "password"')" = key ]; then
        # keyPem is stored rclone-ready: one line with literal \n separators.
        printf 'key_pem = %s\n' "$(cfg '.sftp.keyPem // empty')"
      else
        _sp=$(cfg '.sftp.pass // empty')
        if [ -n "$_sp" ]; then
          _obscured=$(rclone obscure "$_sp") || return 1
          printf 'pass = %s\n' "$_obscured" || return 1
        fi
      fi
      printf '\n'
    } >> "$RCONF" || return 1
  fi
}

# Newest generation this node has shipped; 0 before the first. Rides inside the
# StartOS backup so that generations keep growing across a restore, whatever
# the clock does.
watermark_gen() {
  _w=$(jq -r 'if (.gen|type) == "number" then .gen else empty end' "$WATERMARK" 2>/dev/null)
  if is_gen "$_w"; then echo "$_w"; else echo 0; fi
}

listed() { grep -qxF -- "$1" "$WORK/list"; }

list_target() {
  rm -f "$WORK/list" "$WORK/list.tmp"
  _blocks=$((MAX_LIST_BYTES / 512 + 1))
  # shellcheck disable=SC2086
  (ulimit -f "$_blocks"; rc --config "$RCONF" lsf "$_name:$_path" --files-only $RCLONE_FLAGS $_extra) > "$WORK/list.tmp" 2>"$WORK/err"
  _rc=$?
  [ "$_rc" -eq 3 ] && { : > "$WORK/list" || return 1; return 0; }
  [ "$_rc" -eq 0 ] || return "$_rc"
  _bytes=$(wc -c < "$WORK/list.tmp") || return 1
  [ "$_bytes" -le "$MAX_LIST_BYTES" ] || { echo "remote listing exceeds limit" > "$WORK/err"; return 1; }
  mv -f "$WORK/list.tmp" "$WORK/list"
}

bounded_pull() {
  _remote_file=$1
  _local_file=$2
  _limit=$3
  rm -f "$_local_file" "$_local_file.tmp"
  # shellcheck disable=SC2086
  rc --config "$RCONF" cat "$_name:$_path/$_remote_file" --count $((_limit + 1)) $RCLONE_FLAGS $_extra > "$_local_file.tmp" 2>"$WORK/err" || { rm -f "$_local_file.tmp"; return 1; }
  _bytes=$(wc -c < "$_local_file.tmp") || { rm -f "$_local_file.tmp"; return 1; }
  [ "$_bytes" -le "$_limit" ] || { echo "remote file exceeds limit" > "$WORK/err"; rm -f "$_local_file.tmp"; return 1; }
  [ "$_bytes" -gt 0 ] || { echo "remote file is empty" > "$WORK/err"; rm -f "$_local_file.tmp"; return 1; }
  publish_file "$_local_file.tmp" "$_local_file"
}

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
  if ! list_target; then
    _kind=unknown
    _detail=$(reason_file "$WORK/err")
    return 0
  fi
  if listed "$META"; then
    rm -f "$WORK/m.json"
    if ! bounded_pull "$META" "$WORK/m.json" "$MAX_MARKER_BYTES"; then
      _kind=unknown
      _detail=$(reason_file "$WORK/err")
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
    elif [ "$_have" -le "$(incorporated "$_node")" ]; then
      _kind=old
    else
      _kind=newer
    fi
  elif listed "$OBJECT"; then
    _kind=foreign
  fi
}

remote_publish() {
  _source=$1
  _final=$2
  _mode=$3
  _remote_tmp=".$_final.tmp.$$.$(date +%s)"
  # shellcheck disable=SC2086
  if ! rc --config "$RCONF" copyto "$_source" "$_name:$_path/$_remote_tmp" $RCLONE_FLAGS $_extra --log-level NOTICE > "$WORK/remote.out" 2>&1; then
    _out=$(reason_file "$WORK/remote.out")
    return 1
  fi
  _immutable=''
  [ "$_mode" = immutable ] && _immutable=--immutable
  # shellcheck disable=SC2086
  if rc --config "$RCONF" moveto "$_name:$_path/$_remote_tmp" "$_name:$_path/$_final" $RCLONE_FLAGS $_extra $_immutable --log-level NOTICE > "$WORK/remote.out" 2>&1; then
    if [ "$_mode" = immutable ]; then
      if ! bounded_pull "$_final" "$WORK/published.check" "$MAX_SCB_BYTES" \
        || ! cmp -s "$_source" "$WORK/published.check"; then
        _out='generation record already exists with different content'
        return 1
      fi
    fi
    _out=''
    return 0
  fi
  _out=$(reason_file "$WORK/remote.out")
  # shellcheck disable=SC2086
  rc --config "$RCONF" deletefile "$_name:$_path/$_remote_tmp" $RCLONE_FLAGS $_extra >/dev/null 2>&1 || :
  return 1
}

# Preserves the bytes currently published under the mutable name.
keep_aside() {
  _aside=$1
  bounded_pull "$OBJECT" "$WORK/current.remote" "$MAX_SCB_BYTES" || return 1
  if listed "$_aside"; then
    bounded_pull "$_aside" "$WORK/aside.remote" "$MAX_SCB_BYTES" || return 1
    cmp -s "$WORK/current.remote" "$WORK/aside.remote" && return 0
    echo "generation record already exists with different content" > "$WORK/err"
    return 1
  fi
  if ! remote_publish "$WORK/current.remote" "$_aside" immutable; then
    printf '%s\n' "$_out" > "$WORK/err"
    return 1
  fi
}

# Delete this node's records beyond the newest $KEEP. Never another node's. The
# listing predates the record just uploaded, which is the newest of the $KEEP.
prune() {
  grep -xE "$OBJECT\.[0-9]{1,12}\.$NODE" "$WORK/list" | sed "s/^$OBJECT\.//; s/\.$NODE\$//" \
    | sort -rn | tail -n +"$KEEP" | while read -r _old; do
    # shellcheck disable=SC2086
    rc --config "$RCONF" deletefile "$_name:$_path/$OBJECT.$_old.$NODE" $RCLONE_FLAGS $_extra 2>/dev/null \
      || log "[$_name] could not prune $OBJECT.$_old.$NODE"
  done
}

# Upload a record of channel.backup, then the copy and marker that point at it,
# to every enabled target. Returns 0 only if all of them succeeded and the
# outcome was recorded, so a failing target keeps being retried.
ship() {
  _gen=$1
  _all_ok=0
  : > "$WORK/failures" || return 1
  remotes ship > "$WORK/remotes" || return 1
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
        if ! keep_aside "$OBJECT.$_have.$_node"; then
          fail_target "$_name" archive "$(reason_file "$WORK/err")"
          _all_ok=1
          continue
        fi
        log "[$_name] kept the newer copy (gen=$_have) as $OBJECT.$_have.$_node"
        ;;
      old)
        if ! keep_aside "$OBJECT.$_have.$_node"; then
          fail_target "$_name" archive "$(reason_file "$WORK/err")"
          _all_ok=1
          continue
        fi
        ;;
      foreign)
        _aside="$OBJECT.unknown-$(date +%s)"
        if ! keep_aside "$_aside"; then
          fail_target "$_name" archive "$(reason_file "$WORK/err")"
          _all_ok=1
          continue
        fi
        log "[$_name] kept the copy found there as $_aside"
        ;;
    esac
    # Record first, marker last: the marker only names a complete record.
    if listed "$OBJECT.$_gen.$NODE"; then
      fail_target "$_name" collision "$OBJECT.$_gen.$NODE"
      _all_ok=1
      continue
    fi
    if ! remote_publish "$SNAPSHOT" "$OBJECT.$_gen.$NODE" immutable \
      || ! remote_publish "$SNAPSHOT" "$OBJECT" mutable \
      || ! remote_publish "$WORK/$META" "$META" mutable; then
      fail_target "$_name" upload "$(reason "$_out")"
      _all_ok=1
      continue
    fi
    prune
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
  mkdir -p "$WORK" || return 1
  lock
  restore_pending
  _pending=$?
  if [ "$_pending" -eq 0 ]; then
    unlock
    return 2
  elif [ "$_pending" -eq 2 ]; then
    unlock
    return 6
  fi
  snapshot_config || { unlock; return 6; }
  if [ ! -s "$BACKUP" ]; then
    [ "$1" = force ] && log "no channel.backup yet: LND writes it when the first channel opens"
    [ "$(state_get '.failures // [] | length')" = 0 ] || state_merge '.failures = []' || log "could not clear the failures"
    unlock
    return 3
  fi
  remotes ship > "$WORK/remotes.check" || { unlock; return 1; }
  if [ ! -s "$WORK/remotes.check" ]; then
    [ "$1" = force ] && log "no backup target is enabled"
    unlock
    return 4
  fi
  identify
  build_conf || { unlock; return 1; }
  SNAPSHOT="$WORK/channel.backup.$$"
  rm -f "$SNAPSHOT"
  if ! head -c $((MAX_SCB_BYTES + 1)) "$BACKUP" > "$SNAPSHOT"; then
    rm -f "$SNAPSHOT"
    unlock
    log "channel.backup could not be staged"
    return 1
  fi
  _size=$(wc -c < "$SNAPSHOT") || { rm -f "$SNAPSHOT"; unlock; return 1; }
  [ "$_size" -le "$MAX_SCB_BYTES" ] || { rm -f "$SNAPSHOT"; unlock; return 1; }
  # Reserve before publication, so an interrupted attempt cannot reuse a name.
  _gen=$(($(watermark_gen) + 1))
  _now=$(date +%s)
  [ "$_now" -gt "$_gen" ] && _gen=$_now
  write_atomic "$WATERMARK" "{\"gen\":$_gen}" || { rm -f "$SNAPSHOT"; unlock; return 1; }
  printf '{"gen":%s,"node":"%s"}\n' "$_gen" "$NODE" > "$WORK/$META" \
    || { rm -f "$SNAPSHOT"; unlock; return 1; }
  _prev=$(state_get '.failures')
  if ship "$_gen"; then
    _completed=$(date +%s)
    if ! state_merge --argjson t "$_completed" '.lastSuccess = $t'; then
      log "could not record the success"
      rm -f "$SNAPSHOT"
      unlock
      return 1
    fi
    rm -f "$SNAPSHOT"
    unlock
    if [ "$1" = force ] || { [ -n "$_prev" ] && [ "$_prev" != '[]' ]; }; then
      log "channel.backup shipped to every target (gen=$_gen)"
    fi
    return 0
  fi
  rm -f "$SNAPSHOT"
  unlock
  # De-duplicated: an unchanged failure is logged once, not every retry.
  if [ "$1" = force ] || [ "$(state_get '.failures')" != "$_prev" ]; then
    log "channel backup failing — $(jq -r '.failures[] | "\(.target): \(.code) \(.detail)"' "$STATE" 2>/dev/null | tr '\n' ';')"
  fi
  return 1
}

# ---- restore ---------------------------------------------------------------
# Every copy that can be found is offered to restorechanbackup, one at a time,
# newest first: every retained generation from every target, any copy left
# there without an identity, and the channel.backup the StartOS
# backup itself carried. LND skips channels it already knows, so the union is
# what gets recovered, and nothing is recorded until LND has answered. A copy
# is known by the hash of its bytes, so a rewritten channel.backup can never
# stand in for the record its marker names.
pull() {
  if bounded_pull "$1" "$RESTORED" "$MAX_SCB_BYTES"; then
    return 0
  fi
  _out=$(reason_file "$WORK/err")
  rm -f "$RESTORED"
  return 1
}
sha() { sha256sum "$1" | cut -c1-64; }
tried() {
  jq -e --arg h "$1" '[.restoreAccepted[]?.hash, .restoreRejected[]?.hash] | any(. == $h)' "$STATE" >/dev/null 2>&1
}
offer() {
  config_unchanged || die "channel-backup.json changed during restore"
  _config_hash=$(config_fingerprint) || die "cannot fingerprint channel-backup.json"
  jq -nc --arg d "$1" --arg f "$2" --arg h "$3" --arg n "$4" --arg g "$5" --arg c "$_config_hash" \
    '{dest:$d,file:$f,hash:$h,configHash:$c,node:(if $n == "-" then null else $n end),gen:(if $g == "0" then null else ($g|tonumber) end)}' \
    > "$CANDIDATE.tmp.$$" || die "cannot record the candidate"
  publish_file "$CANDIDATE.tmp.$$" "$CANDIDATE" || die "cannot publish the candidate"
  publish_failures || die "cannot record the outcome"
  log "candidate $2 from $1; restorechanbackup decides"
  exit 0
}

do_restore() {
  mkdir -p "$WORK" || die "cannot create the work directory"
  lock
  restore_pending
  _pending=$?
  if [ "$_pending" -eq 2 ]; then
    die "startup-flags.json cannot be read"
  elif [ "$_pending" -ne 0 ]; then
    log "no pending restore"
    exit 3
  fi
  rm -f "$RESTORED" "$CANDIDATE"
  snapshot_config || die "channel-backup.json cannot be read"
  build_conf || die "cannot build the rclone configuration"
  _incomplete=0
  : > "$WORK/failures" || die "cannot create the failures list"
  : > "$WORK/cands" || die "cannot create the candidate list"
  remotes all > "$WORK/remotes" || die "cannot create the remote list"
  while IFS= read -r _remote; do
    target "$_remote"
    if ! list_target; then
      _incomplete=1
      fail_target "$_name" check "$(reason_file "$WORK/err")"
      continue
    fi
    # Every retained generation is offered newest first. Eight-hex legacy
    # records remain readable; newly written records carry the full node id.
    grep -xE "$OBJECT\.[0-9]{1,12}\.([0-9a-f]{8}|[0-9a-f]{32})" "$WORK/list" \
      | awk -F. '{ print $3, $4, $0 }' \
      | while read -r _g _n _f; do printf '%s %s %s %s\n' "$_g" "$_n" "$_f" "$_remote" >> "$WORK/cands" || exit 1; done \
      || die "cannot build the candidate list"
    grep -xE "$OBJECT\.unknown-[0-9]{1,12}" "$WORK/list" \
      | while read -r _f; do printf '0 - %s %s\n' "$_f" "$_remote" >> "$WORK/cands" || exit 1; done \
      || die "cannot build the candidate list"
    if listed "$OBJECT"; then
      printf '0 - %s %s\n' "$OBJECT" "$_remote" >> "$WORK/cands" || die "cannot build the candidate list"
    fi
  done < "$WORK/remotes"

  sort -rn "$WORK/cands" > "$WORK/cands.sorted" || die "cannot sort the candidate list"
  while read -r _g _n _f _remote; do
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
    head -c $((MAX_SCB_BYTES + 1)) "$BACKUP" > "$RESTORED.tmp.$$" || die "cannot stage the StartOS backup's own copy"
    _size=$(wc -c < "$RESTORED.tmp.$$") || die "cannot size the StartOS backup's own copy"
    [ "$_size" -le "$MAX_SCB_BYTES" ] || die "the StartOS backup's own copy exceeds the restore limit"
    _h=$(sha "$RESTORED.tmp.$$")
    if ! tried "$_h"; then
      publish_file "$RESTORED.tmp.$$" "$RESTORED" || die "cannot publish the StartOS backup's own copy"
      offer volume "$OBJECT" "$_h" - 0
    fi
    rm -f "$RESTORED.tmp.$$"
  fi
  config_unchanged || die "channel-backup.json changed during restore"
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
  _size=$(wc -c < "$CANDIDATE") || die "cannot size the candidate"
  [ "$_size" -le "$MAX_MARKER_BYTES" ] || die "candidate exceeds the size limit"
  _c=$(cat "$CANDIDATE") || die "cannot read the candidate"
  snapshot_config || die "channel-backup.json cannot be read"
  _expected=$(printf '%s' "$_c" | jq -er '.configHash') || die "candidate has no config fingerprint"
  [ "$(config_fingerprint)" = "$_expected" ] || die "channel-backup.json changed during restore"
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
  _size=$(wc -c < "$CANDIDATE") || die "cannot size the candidate"
  [ "$_size" -le "$MAX_MARKER_BYTES" ] || die "candidate exceeds the size limit"
  _c=$(cat "$CANDIDATE") || die "cannot read the candidate"
  state_merge --argjson c "$_c" '.restoreRejected = ((.restoreRejected // []) + [{hash: $c.hash}])' || die "cannot record the rejection"
  rm -f "$RESTORED" "$CANDIDATE"
  log "restore refused: $(printf '%s' "$_c" | jq -r '.file') from $(printf '%s' "$_c" | jq -r '.dest')"
}

finish_restore() {
  lock
  [ -s "$CONFIG_SNAP" ] && config_unchanged || die "channel-backup.json changed during restore"
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
    [ "$_last_ok" -le "$_now" ] || _last_ok=$_now
    if [ "$_fp" = "$_last" ]; then
      if [ "$_retry_at" -gt 0 ] && [ "$_now" -ge "$_retry_at" ]; then :
      elif [ $((_now - _last_ok)) -ge "$BACKSTOP_SECS" ]; then :
      else continue; fi
    fi
    restore_pending
    _pending=$?
    [ "$_pending" -ne 1 ] && continue
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
    restore_pending
    _pending=$?
    if [ "$_pending" -eq 0 ]; then
      log "a restore is in progress; channel.backup is not sent until it completes"
      exit 2
    elif [ "$_pending" -eq 2 ]; then
      log "startup-flags.json cannot be read; channel.backup is not sent"
      exit 6
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
