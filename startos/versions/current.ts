import { VersionInfo } from '@start9labs/start-sdk'

export const current = VersionInfo.of({
  version: '0.21.3-beta:9',
  releaseNotes: {
    en_US: `Unlocking a large wallet on slower hardware, and the migration to the SQLite database backend, no longer fail after 30 seconds.`,
    es_ES: `Desbloquear un monedero grande en hardware más lento, y la migración al backend de base de datos SQLite, ya no fallan tras 30 segundos.`,
    de_DE: `Das Entsperren einer großen Wallet auf langsamerer Hardware und die Migration auf das SQLite-Datenbank-Backend schlagen nicht mehr nach 30 Sekunden fehl.`,
    pl_PL: `Odblokowanie dużego portfela na wolniejszym sprzęcie oraz migracja do bazy danych SQLite nie kończą się już błędem po 30 sekundach.`,
    fr_FR: `Le déverrouillage d'un portefeuille volumineux sur du matériel plus lent, ainsi que la migration vers la base de données SQLite, n'échouent plus au bout de 30 secondes.`,
  },
  migrations: {
    up: async () => {},
  },
})
