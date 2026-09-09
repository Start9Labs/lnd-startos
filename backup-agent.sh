#!/bin/sh
# Continuously copies LND's current static channel backup off-box, and on a
# restore retrieves the copy every configured target holds.
#
#   (default)  watcher daemon
#   --once     copy now, within $ONCE_SECS (Back Up Channels Now)
#   --pull     download each target's channel.backup into $RESTORE_DIR and
#              print {"retrieved":[...],"unreachable":[...]}; exit 6 when a
#              target could not be consulted
# shellcheck disable=SC2016
set -u
umask 077

LND_DIR=/root/.lnd
BACKUP="$LND_DIR/data/chain/bitcoin/mainnet/channel.backup"
CONFIG="$LND_DIR/channel-backup.json"
STATE="$LND_DIR/.channel-backup-state.json"
LOCK="$LND_DIR/.channel-backup.lock"
RESTORE_DIR="$LND_DIR/.channel-backup-restore"

WORK=/tmp/lnd-channel-backup
RCONF="$WORK/rclone.conf"
KNOWN_HOSTS="$WORK/known_hosts"
CONFIG_SNAP="$WORK/config.json"
REMOTES="$WORK/remotes"
FAILURES="$WORK/failures"
OBJECT=channel.backup
MAX_SCB_BYTES=$((16 * 1024 * 1024))
MAX_CONFIG_BYTES=$((256 * 1024))
POLL=10
RETRY_SECS=300
BACKSTOP_SECS=86400
WATCH_RUN_SECS=600
ONCE_SECS=95
CLEANUP_SECS=5
KILL_GRACE_SECS=1
RCLONE_FLAGS="--contimeout=15s --timeout=120s --retries=2 --low-level-retries=2"
MANUAL=0
DEADLINE=0
OP_DEADLINE=0
SNAPSHOT=''
REMOTE_TMP=''
REMOTE_NAME=''
REMOTE_PATH=''
REMOTE_EXTRA=''

log() { echo "[channel-backup] $*" >&2; }

reason() {
  tr -d '\000-\010\013\014\016-\037\177' \
    | grep -v '^[[:space:]]*$' | tail -n 1 \
    | sed 's|^[0-9/]* [0-9:]* [A-Z]*: ||; s|^Failed to create file system for destination "[^"]*": ||' \
    | cut -c1-160
}
reason_file() { tail -c 8192 "$1" 2>/dev/null | reason; }

publish_file() {
  sync -f "$1" || return 1
  mv -f "$1" "$2" || return 1
  sync -f "$(dirname "$2")"
}

write_atomic() {
  _write_tmp="$1.tmp.$$"
  printf '%s\n' "$2" > "$_write_tmp" || return 1
  publish_file "$_write_tmp" "$1" || {
    rm -f "$_write_tmp"
    return 1
  }
}

state_get() { jq -r "$1 // empty" "$STATE" 2>/dev/null || true; }
state_attempt() {
  _attempt=$(state_get '.attempt')
  case "$_attempt" in
    '' | *[!0-9]*) echo 0 ;;
    *)
      if [ ${#_attempt} -le 15 ]; then echo "$_attempt"; else echo 0; fi
      ;;
  esac
}
state_merge() {
  [ -d "$STATE" ] && return 1
  _state='{}'
  if [ -s "$STATE" ]; then
    _state=$(jq -ce 'if type == "object" then . else error("invalid state") end' "$STATE" 2>/dev/null) || _state='{}'
  fi
  _next=$(printf '%s' "$_state" | jq -c "$@" 2>/dev/null) || return 1
  [ -n "$_next" ] || return 1
  write_atomic "$STATE" "$_next"
}
record_outcome() {
  _outcome_attempt=$1
  _outcome_failures=$2
  _outcome_success=$3
  _outcome_no_scb=$4
  if [ "$_outcome_success" = 1 ]; then
    _completed=$(date +%s) || return 1
    state_merge --argjson a "$_outcome_attempt" --argjson f "$_outcome_failures" --argjson t "$_completed" \
      '{attempt: $a, failures: $f, lastSuccess: $t}'
  elif [ "$_outcome_no_scb" = 1 ]; then
    state_merge --argjson a "$_outcome_attempt" '{attempt: $a, failures: [], lastSuccess: null}'
  else
    state_merge --argjson a "$_outcome_attempt" --argjson f "$_outcome_failures" \
      '{attempt: $a, failures: $f, lastSuccess: (if (.lastSuccess | type) == "number" then .lastSuccess else null end)}'
  fi
}

record_preflight_failure() {
  _preflight=$(jq -nc --arg t agent --arg c local --arg d "$1" '[{target:$t,code:$c,detail:$d}]') || return 1
  record_outcome "$_attempt" "$_preflight" 0 0
}

snapshot_config() {
  mkdir -p "$WORK" || return 1
  if [ -e "$CONFIG" ]; then
    _config_size=$(wc -c < "$CONFIG") || return 1
    [ "$_config_size" -le "$MAX_CONFIG_BYTES" ] || return 1
    jq -ce . "$CONFIG" > "$CONFIG_SNAP.tmp.$$" 2>/dev/null || {
      rm -f "$CONFIG_SNAP.tmp.$$"
      return 1
    }
  else
    printf '{}\n' > "$CONFIG_SNAP.tmp.$$" || return 1
  fi
  publish_file "$CONFIG_SNAP.tmp.$$" "$CONFIG_SNAP" || {
    rm -f "$CONFIG_SNAP.tmp.$$"
    return 1
  }
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
      ((startswith("/") or startswith("\\")) | not) and
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

cfg() { jq -r "$1" "$CONFIG_SNAP" 2>/dev/null; }

has_creds() {
  case "$1" in
    gdrive | dropbox)
      [ -n "$(cfg ".$1.clientId // empty")" ] &&
        [ -n "$(cfg ".$1.clientSecret // empty")" ] &&
        [ -n "$(cfg ".$1.token // empty")" ]
      ;;
    nextcloud)
      [ -n "$(cfg '.nextcloud.url // empty')" ] &&
        [ -n "$(cfg '.nextcloud.user // empty')" ] &&
        [ -n "$(cfg '.nextcloud.pass // empty')" ]
      ;;
    sftp)
      [ -n "$(cfg '.sftp.host // empty')" ] &&
        [ -n "$(cfg '.sftp.user // empty')" ] &&
        [ "$(cfg '.sftp.hostKeyVerified // false')" = true ] &&
        {
          if [ "$(cfg '.sftp.authType // "password"')" = key ]; then
            [ -n "$(cfg '.sftp.keyPem // empty')" ]
          else
            [ -n "$(cfg '.sftp.pass // empty')" ]
          fi
        }
      ;;
  esac
}

generate_remotes() {
  : > "$REMOTES" || return 1
  for _provider in gdrive dropbox nextcloud sftp; do
    [ "$(cfg ".$_provider.enabled // false")" = true ] || continue
    _provider_path=$(cfg ".$_provider.path // empty")
    [ -n "$_provider_path" ] || _provider_path=lnd-channel-backups
    printf '%s:%s\n' "$_provider" "$_provider_path" >> "$REMOTES" || return 1
  done
}

target() {
  REMOTE_NAME=${1%%:*}
  REMOTE_PATH=${1#*:}
  REMOTE_EXTRA=''
  [ "$(cfg ".$REMOTE_NAME.insecureTls // false")" = true ] && REMOTE_EXTRA='--no-check-certificate'
}

rc_with_deadline() {
  _rc_deadline=$1
  shift
  if [ "$_rc_deadline" -gt 0 ]; then
    _left=$((_rc_deadline - $(date +%s)))
    if [ "$_left" -le 0 ]; then
      echo "out of time" >&2
      return 124
    fi
    timeout -k "$KILL_GRACE_SECS" "$_left" rclone "$@"
    _rc=$?
    { [ "$_rc" -eq 124 ] || [ "$_rc" -eq 143 ]; } && echo "timed out" >&2
    return "$_rc"
  fi
  rclone "$@"
}
rc() { rc_with_deadline "$OP_DEADLINE" "$@"; }
rc_cleanup() {
  if [ "$DEADLINE" -gt 0 ]; then
    _cleanup_deadline=$((DEADLINE - KILL_GRACE_SECS))
  else
    _cleanup_deadline=$(($(date +%s) + CLEANUP_SECS))
  fi
  rc_with_deadline "$_cleanup_deadline" "$@"
}

build_conf() {
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
    _obscured=$(rc obscure -- "$(cfg '.nextcloud.pass // empty')") || return 1
    printf '[nextcloud]\ntype = webdav\nurl = %s\nvendor = nextcloud\nuser = %s\npass = %s\n\n' \
      "$(cfg '.nextcloud.url // empty')" "$(cfg '.nextcloud.user // empty')" "$_obscured" >> "$RCONF" || return 1
  fi
  if has_creds sftp; then
    cfg '.sftp.knownHosts // empty' > "$KNOWN_HOSTS" || return 1
    {
      printf '[sftp]\ntype = sftp\nhost = %s\nuser = %s\nkey_use_agent = false\nport = %s\nset_modtime = false\nknown_hosts_file = %s\n' \
        "$(cfg '.sftp.host // empty')" "$(cfg '.sftp.user // empty')" "$(cfg '.sftp.port // "22"')" "$KNOWN_HOSTS"
      if [ "$(cfg '.sftp.authType // "password"')" = key ]; then
        printf 'key_pem = %s\n' "$(cfg '.sftp.keyPem // empty')"
      else
        _password=$(cfg '.sftp.pass // empty')
        if [ -n "$_password" ]; then
          _obscured=$(rc obscure -- "$_password") || return 1
          printf 'pass = %s\n' "$_obscured" || return 1
        fi
      fi
      printf '\n'
    } >> "$RCONF" || return 1
  fi
}

random_suffix() {
  _suffix=$(head -c 16 /dev/urandom | od -An -tx1 | tr -d ' \n') || return 1
  case "$_suffix" in
    [0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f]) printf '%s\n' "$_suffix" ;;
    *) return 1 ;;
  esac
}

cleanup_remote_tmp() {
  [ -n "$REMOTE_TMP" ] || return 0
  # shellcheck disable=SC2086
  rc_cleanup --config "$RCONF" deletefile "$REMOTE_NAME:$REMOTE_PATH/$REMOTE_TMP" $RCLONE_FLAGS $REMOTE_EXTRA >/dev/null 2>&1 || :
  REMOTE_TMP=''
}

fail_target() {
  jq -nc --arg t "$1" --arg c "$2" --arg d "$3" '{target:$t,code:$c,detail:$d}' >> "$FAILURES" || return 1
}

ship_target() {
  _remote=$1
  target "$_remote"
  if [ "$REMOTE_NAME" = sftp ]; then
    if [ "$(cfg '.sftp.hostKeyVerified // false')" != true ]; then
      fail_target sftp hostkey-unverified ''
      return 1
    fi
    if [ ! -s "$KNOWN_HOSTS" ]; then
      fail_target sftp hostkey ''
      return 1
    fi
  fi
  _suffix=$(random_suffix) || {
    fail_target "$REMOTE_NAME" local 'could not create a temporary name'
    return 1
  }
  REMOTE_TMP=".$OBJECT.tmp.$_suffix"
  # shellcheck disable=SC2086
  if ! rc --config "$RCONF" copyto "$SNAPSHOT" "$REMOTE_NAME:$REMOTE_PATH/$REMOTE_TMP" $RCLONE_FLAGS $REMOTE_EXTRA --log-level NOTICE > "$WORK/remote.out" 2>&1; then
    _detail=$(reason_file "$WORK/remote.out")
    cleanup_remote_tmp
    fail_target "$REMOTE_NAME" upload "$_detail"
    return 1
  fi
  # shellcheck disable=SC2086
  if ! rc --config "$RCONF" moveto "$REMOTE_NAME:$REMOTE_PATH/$REMOTE_TMP" "$REMOTE_NAME:$REMOTE_PATH/$OBJECT" $RCLONE_FLAGS $REMOTE_EXTRA --log-level NOTICE > "$WORK/remote.out" 2>&1; then
    _detail=$(reason_file "$WORK/remote.out")
    cleanup_remote_tmp
    fail_target "$REMOTE_NAME" publish "$_detail"
    return 1
  fi
  REMOTE_TMP=''
  return 0
}

stage_backup() {
  SNAPSHOT="$WORK/channel.backup.$$"
  rm -f "$SNAPSHOT"
  head -c $((MAX_SCB_BYTES + 1)) "$BACKUP" > "$SNAPSHOT" || {
    rm -f "$SNAPSHOT"
    return 1
  }
  _size=$(wc -c < "$SNAPSHOT") || {
    rm -f "$SNAPSHOT"
    return 1
  }
  if [ "$_size" -eq 0 ] || [ "$_size" -gt "$MAX_SCB_BYTES" ]; then
    rm -f "$SNAPSHOT"
    return 1
  fi
}

lock() {
  exec 9>> "$LOCK" || return 1
  if [ "$MANUAL" = 1 ]; then
    flock -n 9 || return 5
  else
    flock -x 9 || return 1
  fi
}
unlock() { flock -u 9; }

# Returns 0 only after every enabled target has the staged current copy.
do_backup() {
  _announce=$1
  mkdir -p "$WORK" || return 1
  lock
  _lock_result=$?
  [ "$_lock_result" -eq 0 ] || return "$_lock_result"
  _attempt=$(($(state_attempt) + 1))
  [ "$MANUAL" = 1 ] && printf '%s\n' "$_attempt"
  : > "$RCONF" || {
    record_preflight_failure 'temporary configuration could not be cleared' || :
    unlock
    return 1
  }
  if [ ! -s "$BACKUP" ]; then
    record_outcome "$_attempt" '[]' 0 1 || {
      unlock
      return 1
    }
    unlock
    [ "$_announce" = force ] && log "no channel.backup yet: LND writes it when the first channel opens"
    return 3
  fi
  snapshot_config || {
    record_preflight_failure 'backup configuration could not be read' || :
    unlock
    return 6
  }
  generate_remotes || {
    record_preflight_failure 'backup targets could not be prepared' || :
    unlock
    return 1
  }
  if [ ! -s "$REMOTES" ]; then
    unlock
    [ "$_announce" = force ] && log "no backup target is enabled"
    return 4
  fi
  build_conf || {
    record_preflight_failure 'backup credentials could not be prepared' || :
    unlock
    return 1
  }
  stage_backup || {
    record_preflight_failure 'channel.backup could not be staged' || :
    unlock
    log "channel.backup could not be staged"
    return 1
  }
  : > "$FAILURES" || {
    record_preflight_failure 'backup results could not be prepared' || :
    rm -f "$SNAPSHOT"
    unlock
    return 1
  }
  _all_ok=1
  while IFS= read -r _remote; do
    if [ "$OP_DEADLINE" -gt 0 ] && [ "$(date +%s)" -ge "$OP_DEADLINE" ]; then
      target "$_remote"
      fail_target "$REMOTE_NAME" timeout '' || _all_ok=0
      _all_ok=0
      continue
    fi
    ship_target "$_remote" || _all_ok=0
  done < "$REMOTES"
  _failures=$(jq -sc . "$FAILURES" 2>/dev/null) || _failures=''
  if [ -z "$_failures" ] || ! record_outcome "$_attempt" "$_failures" "$_all_ok" 0; then
    rm -f "$SNAPSHOT"
    unlock
    log "could not record the outcome"
    return 1
  fi
  rm -f "$SNAPSHOT"
  unlock
  if [ "$_all_ok" = 1 ]; then
    [ "$_announce" = force ] && log "channel.backup copied to every enabled target"
    return 0
  fi
  log "channel backup failing — $(jq -r '"\(.target): \(.code) \(.detail)"' "$FAILURES" 2>/dev/null | tr '\n' ';')"
  return 1
}

# Every target with credentials, enabled or not: a restore reads them all.
do_pull() {
  mkdir -p "$WORK" || return 1
  lock || return 1
  rm -rf "$RESTORE_DIR" && mkdir -p "$RESTORE_DIR" || {
    unlock
    return 1
  }
  : > "$RCONF" || {
    unlock
    return 1
  }
  snapshot_config || {
    unlock
    log "backup configuration could not be read"
    return 6
  }
  build_conf || {
    unlock
    log "backup credentials could not be prepared"
    return 1
  }
  : > "$FAILURES" || {
    unlock
    return 1
  }
  _retrieved=''
  _incomplete=0
  for _provider in gdrive dropbox nextcloud sftp; do
    has_creds "$_provider" || continue
    _provider_path=$(cfg ".$_provider.path // empty")
    [ -n "$_provider_path" ] || _provider_path=lnd-channel-backups
    target "$_provider:$_provider_path"
    _dest="$RESTORE_DIR/$_provider"
    rm -f "$_dest.tmp"
    # shellcheck disable=SC2086
    if rc --config "$RCONF" copyto "$REMOTE_NAME:$REMOTE_PATH/$OBJECT" "$_dest.tmp" $RCLONE_FLAGS $REMOTE_EXTRA --log-level NOTICE > "$WORK/remote.out" 2>&1; then
      _size=$(wc -c < "$_dest.tmp" 2>/dev/null) || _size=0
      if [ "$_size" -gt 0 ] && [ "$_size" -le "$MAX_SCB_BYTES" ] && mv -f "$_dest.tmp" "$_dest"; then
        log "[$_provider] channel.backup retrieved"
        _retrieved="$_retrieved $_provider"
      else
        rm -f "$_dest.tmp"
        log "[$_provider] the copy there is empty or oversized; skipped"
      fi
    else
      _rc=$?
      rm -f "$_dest.tmp"
      # 3 and 4: nothing at that path, which a target never written to is.
      if [ "$_rc" -eq 3 ] || [ "$_rc" -eq 4 ]; then
        log "[$_provider] holds no channel.backup"
      else
        _incomplete=1
        fail_target "$_provider" check "$(reason_file "$WORK/remote.out")" || {
          unlock
          return 1
        }
        log "[$_provider] could not be reached"
      fi
    fi
  done
  _unreachable=$(jq -sc . "$FAILURES" 2>/dev/null) || {
    unlock
    return 1
  }
  jq -nc --arg r "$_retrieved" --argjson u "$_unreachable" \
    '{retrieved: ($r | split(" ") | map(select(length > 0))), unreachable: $u}' || {
    unlock
    return 1
  }
  unlock
  [ "$_incomplete" -eq 0 ] || return 6
  return 0
}

fingerprint() {
  stat -c '%n:%i:%s:%Y' "$BACKUP" "$CONFIG" 2>/dev/null || :
}

watch_loop() {
  trap 'cleanup_remote_tmp; exit 0' TERM INT
  mkdir -p "$WORK" || exit 1
  log "started"
  _last=none
  _retry_at=0
  _last_ok=$(state_get '.lastSuccess')
  case "$_last_ok" in '' | *[!0-9]*) _last_ok=0 ;; esac
  _last_clock=$(date +%s)
  while :; do
    sleep "$POLL"
    _fp=$(fingerprint)
    _now=$(date +%s)
    if [ "$_now" -lt "$_last_clock" ]; then
      _retry_at=$_now
      [ "$_last_ok" -le "$_now" ] || _last_ok=$_now
    fi
    _last_clock=$_now
    if [ "$_fp" = "$_last" ]; then
      if [ "$_retry_at" -gt 0 ]; then
        [ "$_now" -ge "$_retry_at" ] || continue
      elif [ "$_last_ok" -gt 0 ] && [ $((_now - _last_ok)) -ge "$BACKSTOP_SECS" ]; then :
      else
        continue
      fi
    fi
    _last=$_fp
    OP_DEADLINE=$((_now + WATCH_RUN_SECS))
    do_backup normal
    OP_DEADLINE=0
    case $? in
      0)
        _retry_at=0
        _last_ok=$(state_get '.lastSuccess')
        ;;
      3 | 4) _retry_at=0 ;;
      6) _last=none ;;
      *) _retry_at=$((_now + RETRY_SECS)) ;;
    esac
  done
}

case "${1:-}" in
  --once)
    trap 'cleanup_remote_tmp' EXIT
    trap 'cleanup_remote_tmp; exit 1' TERM INT
    MANUAL=1
    _started=$(date +%s)
    DEADLINE=$((_started + ONCE_SECS))
    OP_DEADLINE=$((DEADLINE - CLEANUP_SECS - KILL_GRACE_SECS))
    RCLONE_FLAGS="--contimeout=8s --timeout=20s --retries=1 --low-level-retries=1"
    do_backup force
    ;;
  --pull) do_pull ;;
  '') watch_loop ;;
  *)
    log "unknown argument"
    exit 1
    ;;
esac
