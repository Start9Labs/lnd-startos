import { IMPOSSIBLE, VersionInfo } from '@start9labs/start-sdk'

export const current = VersionInfo.of({
  version: '0.21.5-beta:1',
  releaseNotes: {
    en_US: `Establishes LND's control binding before migrations and certificate issuance, including when reinstalling over data carried from StartOS 0.3.5.1. REST and gRPC connection links still appear only once the wallet's admin macaroon exists. The gRPC link can be published before the local TLS certificate file is created.`,
    es_ES: `Establece el enlace de control de LND antes de las migraciones y la emisión de certificados, incluso al reinstalar sobre datos procedentes de StartOS 0.3.5.1. Los enlaces de conexión REST y gRPC siguen apareciendo solo cuando existe el macaroon de administrador de la billetera. El enlace gRPC puede publicarse antes de que se cree el archivo del certificado TLS local.`,
    de_DE: `Richtet die Kontroll-Portbindung von LND vor Migrationen und der Zertifikatsausstellung ein, auch bei einer Neuinstallation über Daten aus StartOS 0.3.5.1. REST- und gRPC-Verbindungslinks erscheinen weiterhin erst, wenn das Admin-Macaroon der Wallet vorhanden ist. Der gRPC-Link kann bereits vor dem Erstellen der lokalen TLS-Zertifikatsdatei veröffentlicht werden.`,
    pl_PL: `Tworzy powiązanie portu kontrolnego LND przed migracjami i wystawieniem certyfikatów, także podczas ponownej instalacji na danych przeniesionych ze StartOS 0.3.5.1. Łącza połączeń REST i gRPC nadal pojawiają się dopiero po utworzeniu macaroon administratora portfela. Łącze gRPC może zostać opublikowane przed utworzeniem lokalnego pliku certyfikatu TLS.`,
    fr_FR: `Établit la liaison de contrôle de LND avant les migrations et l'émission des certificats, y compris lors d'une réinstallation sur des données provenant de StartOS 0.3.5.1. Les liens de connexion REST et gRPC n'apparaissent toujours qu'une fois le macaroon administrateur du portefeuille créé. Le lien gRPC peut être publié avant la création du fichier de certificat TLS local.`,
  },
  migrations: {
    up: async () => {},
    down: IMPOSSIBLE,
  },
})
