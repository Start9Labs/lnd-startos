import { VersionInfo } from '@start9labs/start-sdk'

export const current = VersionInfo.of({
  version: '0.21.1-beta:5',
  releaseNotes: {
    en_US: `Puts the **REST** connection back behind StartOS-managed TLS. gRPC is unchanged.

**REST wallets connect without turning off certificate checks**
- StartOS serves REST on port 8080 with your server's own certificate — the one your device already trusts through the StartOS Root CA, or your Let's Encrypt certificate if you use a custom domain. Wallets such as Zeus connect with certificate validation left on.
- LND's certificate no longer travels inside the REST connection string, so its pairing QR code is small enough to display and scan again.

**⚠️ Re-pair REST wallets after updating**
- The REST port and certificate both change, so REST connection details saved from the previous version will not reconnect. Open the **REST LND Connect** interface and scan the new code. gRPC connections are unaffected.

**⚠️ Services using LND's REST API need their own update**
- LNbits, Ride The Lightning and BOLT12 Pay look up LND's REST address in a way that stops resolving here, and will report LND as unreachable until each of them is updated. Nothing about the connection itself changes for them — only how they find the port. Services that use gRPC are unaffected.`,
    es_ES: `Devuelve la conexión **REST** al TLS gestionado por StartOS. gRPC no cambia.

**Los monederos REST se conectan sin desactivar la validación de certificados**
- StartOS sirve REST en el puerto 8080 con el certificado propio de tu servidor: el que tu dispositivo ya considera de confianza a través de la CA raíz de StartOS, o tu certificado de Let's Encrypt si usas un dominio propio. Monederos como Zeus se conectan con la validación de certificados activada.
- El certificado de LND ya no viaja dentro de la cadena de conexión REST, así que su código QR de emparejamiento vuelve a ser lo bastante pequeño como para mostrarse y escanearse.

**⚠️ Vuelve a emparejar los monederos REST tras actualizar**
- El puerto y el certificado REST cambian, por lo que los datos de conexión REST guardados de la versión anterior no volverán a conectar. Abre la interfaz **REST LND Connect** y escanea el nuevo código. Las conexiones gRPC no se ven afectadas.

**⚠️ Los servicios que usan la API REST de LND necesitan su propia actualización**
- LNbits, Ride The Lightning y BOLT12 Pay localizan la dirección REST de LND de una forma que aquí deja de resolverse, y mostrarán LND como inaccesible hasta que cada uno se actualice. La conexión en sí no cambia para ellos: solo cómo encuentran el puerto. Los servicios que usan gRPC no se ven afectados.`,
    de_DE: `Stellt die **REST**-Verbindung wieder auf das von StartOS verwaltete TLS um. gRPC bleibt unverändert.

**REST-Wallets verbinden sich ohne abgeschaltete Zertifikatsprüfung**
- StartOS bedient REST auf Port 8080 mit dem eigenen Zertifikat Ihres Servers — dem, dem Ihr Gerät über die StartOS-Root-CA bereits vertraut, oder Ihrem Let's-Encrypt-Zertifikat, wenn Sie eine eigene Domain nutzen. Wallets wie Zeus verbinden sich mit aktivierter Zertifikatsprüfung.
- Das Zertifikat von LND steckt nicht mehr in der REST-Verbindungszeichenfolge, sodass deren Kopplungs-QR-Code wieder klein genug ist, um angezeigt und gescannt zu werden.

**⚠️ Koppeln Sie REST-Wallets nach dem Update neu**
- REST-Port und -Zertifikat ändern sich, daher verbinden sich gespeicherte REST-Verbindungsdaten der vorherigen Version nicht mehr. Öffnen Sie die Schnittstelle **REST LND Connect** und scannen Sie den neuen Code. gRPC-Verbindungen sind nicht betroffen.

**⚠️ Dienste, die LNDs REST-API nutzen, brauchen ihr eigenes Update**
- LNbits, Ride The Lightning und BOLT12 Pay ermitteln die REST-Adresse von LND auf eine Weise, die hier nicht mehr auflöst, und melden LND als nicht erreichbar, bis jeder von ihnen aktualisiert wurde. An der Verbindung selbst ändert sich für sie nichts — nur daran, wie sie den Port finden. Dienste, die gRPC nutzen, sind nicht betroffen.`,
    pl_PL: `Przywraca połączenie **REST** do TLS zarządzanego przez StartOS. gRPC pozostaje bez zmian.

**Portfele REST łączą się bez wyłączania weryfikacji certyfikatu**
- StartOS obsługuje REST na porcie 8080 własnym certyfikatem serwera — tym, któremu Twoje urządzenie już ufa dzięki głównemu CA StartOS, albo Twoim certyfikatem Let's Encrypt, jeśli używasz własnej domeny. Portfele takie jak Zeus łączą się z włączoną weryfikacją certyfikatu.
- Certyfikat LND nie jest już przenoszony w ciągu połączenia REST, więc jego kod QR do parowania znów jest na tyle mały, że da się go wyświetlić i zeskanować.

**⚠️ Po aktualizacji sparuj ponownie portfele REST**
- Port i certyfikat REST się zmieniają, więc dane połączenia REST zapisane z poprzedniej wersji nie połączą się ponownie. Otwórz interfejs **REST LND Connect** i zeskanuj nowy kod. Połączenia gRPC pozostają bez zmian.

**⚠️ Usługi korzystające z API REST LND wymagają własnej aktualizacji**
- LNbits, Ride The Lightning i BOLT12 Pay ustalają adres REST LND w sposób, który przestaje tu działać, i będą zgłaszać LND jako nieosiągalny, dopóki każda z nich nie zostanie zaktualizowana. Samo połączenie się dla nich nie zmienia — zmienia się tylko sposób znajdowania portu. Usługi korzystające z gRPC pozostają nietknięte.`,
    fr_FR: `Replace la connexion **REST** derrière le TLS géré par StartOS. gRPC est inchangé.

**Les portefeuilles REST se connectent sans désactiver la validation du certificat**
- StartOS sert REST sur le port 8080 avec le certificat propre à votre serveur — celui auquel votre appareil fait déjà confiance via l'autorité racine StartOS, ou votre certificat Let's Encrypt si vous utilisez un domaine personnalisé. Des portefeuilles comme Zeus se connectent avec la validation du certificat activée.
- Le certificat de LND ne circule plus dans la chaîne de connexion REST, si bien que son QR code d'appairage est de nouveau assez petit pour être affiché et scanné.

**⚠️ Réappairez les portefeuilles REST après la mise à jour**
- Le port et le certificat REST changent : les informations de connexion REST enregistrées avec la version précédente ne se reconnecteront pas. Ouvrez l'interface **REST LND Connect** et scannez le nouveau code. Les connexions gRPC ne sont pas concernées.

**⚠️ Les services utilisant l'API REST de LND nécessitent leur propre mise à jour**
- LNbits, Ride The Lightning et BOLT12 Pay déterminent l'adresse REST de LND d'une manière qui cesse de se résoudre ici, et signaleront LND comme injoignable tant que chacun n'aura pas été mis à jour. La connexion elle-même ne change pas pour eux — seulement la façon dont ils trouvent le port. Les services utilisant gRPC ne sont pas concernés.`,
  },
  migrations: {},
})
