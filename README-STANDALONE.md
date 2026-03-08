# EtherX Browser - Standalone Edition

**Verzija bez proxy servera** - direktan pristup web stranicama.

## Značajke

- ✅ **Nema početnog URL-a** - pokreće se s `about:blank`
- ✅ **Bez dependency na proxy** - direktan WebView pristup
- ✅ **Samostalan browser** - korisnik unosi URL direktno
- ✅ **WalletConnect** - ista Ethereum/Web3 podrška
- ✅ **Android + iOS** - kompajlira za obje platforme

## Razlike od glavne verzije

| Opcija | Glavna verzija | Standalone |
|--------|---------------|------------|
| Početni URL | `https://n8n.kriptoentuzijasti.io/browser.html` | `about:blank` |
| Proxy server | ✅ Da | ❌ Ne |
| App naziv | EtherX Browser | EtherX Browser Standalone |
| Bundle ID (iOS) | `io.kriptoentuzijasti.etherx` | `io.kriptoentuzijasti.etherx.standalone` |

## Build

```bash
# Android
cd android
./gradlew assembleRelease

# iOS (na Mac-u)
cd ios
pod install
xcodebuild archive ...
```

## Konfiguracija

Izmjeni `mobile-mode.ts` za promjenu postavki:

```typescript
const mobileMode = {
    demoMode: false,
    appDisplayName: 'EtherX Browser Standalone',
    titleLabel: 'EtherX Browser',
    badgeLabel: 'Standalone',
    initialUrl: 'about:blank',  // Promijeni ako želiš drugi početni URL
};
```

## Instalacija

Ista procedura kao i glavna verzija - koristi deploy skripte ili build ručno.
