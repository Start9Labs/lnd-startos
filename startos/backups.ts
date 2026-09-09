import { channelBackupJson } from './fileModels/channel-backup.json'
import { startupFlagsJson } from './fileModels/startupFlags.json'
import { sdk } from './sdk'

export const { createBackup, restoreInit } = sdk.setupBackups(
  async ({ effects }) =>
    sdk.Backups.ofVolumes('main')
      .setOptions({
        exclude: [
          // Holds nothing a restore needs — setPostRestore and seedFiles
          // recreate it with what restore requires, and needsSqliteMigration
          // decides from files on disk — while importPending can hold an
          // origin's password in cleartext, which must not ride into backups.
          'startup-flags.json',
          'data/graph',
          'data/chain/bitcoin/mainnet/channel.db',
          'data/chain/bitcoin/mainnet/sphinxreplay.db',
          'data/chain/bitcoin/mainnet/neutrino.db',
          'data/chain/bitcoin/mainnet/block_headers.bin',
          'data/chain/bitcoin/mainnet/reg_filter_headers.bin',
          'logs',
          '.channel-backup-state.json',
          '.channel-backup.lock',
          'channel.backup.startos-restore',
          'channel.backup.startos-restore.tmp',
        ],
      })
      .setPostRestore(async (effects) => {
        const backups = await channelBackupJson.read().once()
        if (backups) {
          await channelBackupJson.write(effects, {
            gdrive: backups.gdrive && { ...backups.gdrive, enabled: false },
            dropbox: backups.dropbox && { ...backups.dropbox, enabled: false },
            nextcloud: backups.nextcloud && {
              ...backups.nextcloud,
              enabled: false,
            },
            sftp: backups.sftp && { ...backups.sftp, enabled: false },
          })
        }
        // Drop any import the backup was carrying: its origin credentials are
        // stale, and re-running a copy against the origin is never what a
        // restore means — recovery goes through the SCB flow the restore flag
        // drives. Re-running Initialize Wallet is the way to migrate again.
        await startupFlagsJson.merge(effects, {
          restore: true,
          importPending: false,
        })
      }),
)
