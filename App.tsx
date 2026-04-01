/// <reference path="/tmp/etherx-mobile/loose-globals.d.ts" />

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    Image,
    Modal,
    Platform,
    SafeAreaView,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { WebView, WebViewMessageEvent, WebViewNavigation } from 'react-native-webview';
import mobileMode from './mobile-mode';

interface Tab {
    id: number;
    url: string;
    title: string;
    faviconUrl?: string;
}

interface Bookmark {
    id: number;
    url: string;
    title: string;
    ts: number;
}

interface HistoryEntry {
    id: number;
    url: string;
    title: string;
    ts: number;
}

interface Settings {
    searchEngine: 'google' | 'duckduckgo' | 'bing';
    customUserAgent?: string;
    theme: 'dark' | 'light';
}

interface FindState {
    visible: boolean;
    query: string;
    currentMatch: number;
    totalMatches: number;
}

const INITIAL_URL = mobileMode.initialUrl;
const APP_TITLE = mobileMode.titleLabel;
const APP_BADGE = mobileMode.demoMode ? 'Demo' : mobileMode.badgeLabel;
const BROWSER_THEME = {
    bg: '#1a1a2e',
    bg2: '#16213e',
    bg3: '#0f3460',
    accent: '#667eea',
    accent2: '#764ba2',
    text: '#e0e0e0',
    text2: '#aaa',
    text3: '#666',
    border: '#2a2a3e',
    border2: '#333',
    green: '#27c93f',
    yellow: '#f5a623',
    red: '#ff5f56',
};

const buildFaviconUrl = (value: string): string | undefined => {
    if (!/^https?:\/\//.test(value)) {
        return undefined;
    }

    return `https://www.google.com/s2/favicons?sz=64&domain_url=${encodeURIComponent(value)}`;
};

const normalizeTabTitle = (title?: string, fallbackUrl?: string): string => {
    if (title && title.trim()) {
        return title.trim();
    }

    if (fallbackUrl && fallbackUrl.trim()) {
        return fallbackUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');
    }

    return 'New Tab';
};

const getSecureLabel = (value: string): string => {
    if (value.startsWith('https://')) {
        return 'Secure';
    }

    if (value.startsWith('http://')) {
        return 'HTTP';
    }

    return 'Search';
};

const getDomainLabel = (value: string): string => {
    const sanitized = value.replace(/^https?:\/\//, '').replace(/^www\./, '');
    return sanitized.split('/')[0] || 'etherx-mobile';
};

export default function App() {
    const webViewRef = useRef<WebView>(null);
    const [url, setUrl] = useState<string>(INITIAL_URL);
    const [currentUrl, setCurrentUrl] = useState<string>(INITIAL_URL);
    const [canGoBack, setCanGoBack] = useState<boolean>(false);
    const [canGoForward, setCanGoForward] = useState<boolean>(false);
    const [loading, setLoading] = useState<boolean>(false);
    const [loadingProgress, setLoadingProgress] = useState<number>(0);
    const [tabs, setTabs] = useState<Tab[]>([
        {
            id: 1,
            url: INITIAL_URL,
            title: APP_TITLE,
            faviconUrl: buildFaviconUrl(INITIAL_URL),
        },
    ]);
    const [activeTabId, setActiveTabId] = useState<number>(1);
    const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
    const [history, setHistory] = useState<HistoryEntry[]>([]);
    const [settings, setSettings] = useState<Settings>({
        searchEngine: 'google',
        theme: 'dark',
    });
    const [showBookmarks, setShowBookmarks] = useState<boolean>(false);
    const [showHistory, setShowHistory] = useState<boolean>(false);
    const [showSettings, setShowSettings] = useState<boolean>(false);
    const [findState, setFindState] = useState<FindState>({
        visible: false,
        query: '',
        currentMatch: 0,
        totalMatches: 0,
    });

    // Inject JavaScript bridge for localStorage and Web3
    const injectedJavaScript = `
    (function() {
      // Mark as EtherX Mobile
      window.ETHERX_MOBILE = true;
      window.ETHERX_PLATFORM = '${Platform.OS}';
      window.ETHERX_VERSION = '1.0.0';

      // Override localStorage to use React Native AsyncStorage
      const originalSetItem = localStorage.setItem;
      const originalGetItem = localStorage.getItem;
      const originalRemoveItem = localStorage.removeItem;

      localStorage.setItem = function(key, value) {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'localStorage',
          action: 'setItem',
          key: key,
          value: value
        }));
        return originalSetItem.call(this, key, value);
      };

      // Inject Web3 provider (Ethereum)
      window.ethereum = {
        isMetaMask: true,
        isEtherX: true,
        request: async ({ method, params }) => {
          return new Promise((resolve, reject) => {
            const requestId = 'web3_' + Date.now() + '_' + Math.random();
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'web3',
              requestId: requestId,
              method: method,
              params: params
            }));
            
            // Timeout after 30 seconds
            setTimeout(() => reject(new Error('Request timeout')), 30000);
          });
        },
        on: (event, callback) => {
          console.log('EtherX: Ethereum event listener registered:', event);
        }
      };

      // Notify React Native that page is ready
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'ready',
        userAgent: navigator.userAgent
      }));

      console.log('EtherX Mobile Bridge initialized');
    })();
    true;
  `;

    const handleMessage = async (event: WebViewMessageEvent) => {
        try {
            const data = JSON.parse(event.nativeEvent.data);

            if (data.type === 'localStorage') {
                if (data.action === 'setItem') {
                    await AsyncStorage.setItem(data.key, data.value);
                } else if (data.action === 'getItem') {
                    const value = await AsyncStorage.getItem(data.key);
                    webViewRef.current?.injectJavaScript(`
            (function() {
              const event = new CustomEvent('storageReply', { 
                detail: { key: '${data.key}', value: ${JSON.stringify(value)} }
              });
              window.dispatchEvent(event);
            })();
          `);
                }
            } else if (data.type === 'web3') {
                // Handle Web3 requests - implement wallet integration here
                console.log('Web3 request:', data.method, data.params);
            } else if (data.type === 'ready') {
                console.log('WebView ready:', data.userAgent);
            } else if (data.type === 'findResult') {
                // Handle find in page result
                console.log('Find result:', data.found);
            }
        } catch (e) {
            console.error('Message handling error:', e);
        }
    };

    const activeTab = tabs.find((tab: Tab) => tab.id === activeTabId);

    // Load bookmarks, history, settings on mount
    useEffect(() => {
        const loadData = async () => {
            try {
                const [bookmarksData, historyData, settingsData, sessionData] = await Promise.all([
                    AsyncStorage.getItem('ex_bookmarks'),
                    AsyncStorage.getItem('ex_history'),
                    AsyncStorage.getItem('ex_settings'),
                    AsyncStorage.getItem('ex_session'),
                ]);

                if (bookmarksData) {
                    setBookmarks(JSON.parse(bookmarksData));
                }
                if (historyData) {
                    setHistory(JSON.parse(historyData));
                }
                if (settingsData) {
                    setSettings(JSON.parse(settingsData));
                }
                if (sessionData) {
                    const session = JSON.parse(sessionData);
                    if (session.tabs && session.tabs.length > 0) {
                        setTabs(session.tabs);
                        setActiveTabId(session.activeTabId || session.tabs[0].id);
                    }
                }
            } catch (e) {
                console.error('Failed to load data:', e);
            }
        };
        loadData();
    }, []);

    // Save session on tabs change
    useEffect(() => {
        const saveSession = async () => {
            try {
                await AsyncStorage.setItem(
                    'ex_session',
                    JSON.stringify({ tabs, activeTabId }),
                );
            } catch (e) {
                console.error('Failed to save session:', e);
            }
        };
        saveSession();
    }, [tabs, activeTabId]);

    useEffect(() => {
        if (!activeTab) {
            return;
        }

        setUrl(activeTab.url);
        setCurrentUrl(activeTab.url);
    }, [activeTab]);

    // Helper: Get search URL based on settings
    const getSearchUrl = (query: string): string => {
        const engines = {
            google: `https://www.google.com/search?q=${encodeURIComponent(query)}`,
            duckduckgo: `https://duckduckgo.com/?q=${encodeURIComponent(query)}`,
            bing: `https://www.bing.com/search?q=${encodeURIComponent(query)}`,
        };
        return engines[settings.searchEngine] || engines.google;
    };

    // Bookmarks
    const addBookmark = async () => {
        if (!activeTab || !activeTab.url) return;

        const exists = bookmarks.find(b => b.url === activeTab.url);
        if (exists) return;

        const newBookmark: Bookmark = {
            id: Date.now(),
            url: activeTab.url,
            title: activeTab.title,
            ts: Date.now(),
        };

        const updated = [newBookmark, ...bookmarks];
        setBookmarks(updated);
        await AsyncStorage.setItem('ex_bookmarks', JSON.stringify(updated));
    };

    const removeBookmark = async (id: number) => {
        const updated = bookmarks.filter(b => b.id !== id);
        setBookmarks(updated);
        await AsyncStorage.setItem('ex_bookmarks', JSON.stringify(updated));
    };

    // History
    const addHistory = async (url: string, title: string) => {
        const newEntry: HistoryEntry = {
            id: Date.now(),
            url,
            title,
            ts: Date.now(),
        };

        const updated = [newEntry, ...history.filter(h => h.url !== url)].slice(0, 500);
        setHistory(updated);
        await AsyncStorage.setItem('ex_history', JSON.stringify(updated));
    };

    const clearHistory = async () => {
        setHistory([]);
        await AsyncStorage.setItem('ex_history', '[]');
    };

    // Settings
    const saveSettings = async (newSettings: Settings) => {
        setSettings(newSettings);
        await AsyncStorage.setItem('ex_settings', JSON.stringify(newSettings));
    };

    // Find in Page
    const findInPage = (query: string, forward: boolean = true) => {
        if (!query) {
            setFindState({ visible: false, query: '', currentMatch: 0, totalMatches: 0 });
            return;
        }

        webViewRef.current?.injectJavaScript(`
            (function() {
                if (window.find) {
                    const found = window.find('${query.replace(/'/g, "\\'")}', false, ${!forward}, false, false, true, false);
                    window.ReactNativeWebView.postMessage(JSON.stringify({
                        type: 'findResult',
                        found: found
                    }));
                }
            })();
            true;
        `);
    };

    const closeFindBar = () => {
        setFindState({ visible: false, query: '', currentMatch: 0, totalMatches: 0 });
        webViewRef.current?.injectJavaScript(`
            window.getSelection()?.removeAllRanges();
            true;
        `);
    };

    const navigateTo = (newUrl: string) => {
        let finalUrl = newUrl.trim();
        const hasProtocol = /^https?:\/\//.test(finalUrl);

        // Add https:// if no protocol
        if (!hasProtocol) {
            if (finalUrl.indexOf('.') !== -1) {
                finalUrl = 'https://' + finalUrl;
            } else {
                // Search query using configured search engine
                finalUrl = getSearchUrl(finalUrl);
            }
        }

        setUrl(finalUrl);
        setCurrentUrl(finalUrl);

        setTabs((prevTabs: Tab[]) =>
            prevTabs.map((tab: Tab) =>
                tab.id === activeTabId
                    ? {
                        ...tab,
                        url: finalUrl,
                        title: normalizeTabTitle(tab.title, finalUrl),
                        faviconUrl: buildFaviconUrl(finalUrl),
                    }
                    : tab,
            ),
        );
    };

    const createNewTab = () => {
        const newTab = {
            id: Date.now(),
            url: INITIAL_URL,
            title: 'New Tab',
            faviconUrl: buildFaviconUrl(INITIAL_URL),
        };
        setTabs((prevTabs: Tab[]) => [...prevTabs, newTab]);
        setActiveTabId(newTab.id);
        setUrl(INITIAL_URL);
    };

    const closeTab = (tabId: number) => {
        if (tabs.length === 1) return; // Don't close last tab

        const newTabs = tabs.filter((tab: Tab) => tab.id !== tabId);
        setTabs(newTabs);

        if (activeTabId === tabId) {
            const lastOpenTab = newTabs[newTabs.length - 1];

            if (lastOpenTab) {
                setActiveTabId(lastOpenTab.id);
                setUrl(lastOpenTab.url);
                setCurrentUrl(lastOpenTab.url);
            }
        }
    };

    const goHome = () => {
        navigateTo(INITIAL_URL);
    };

    const handleReloadPress = () => {
        if (loading) {
            webViewRef.current?.stopLoading();
            setLoading(false);
            return;
        }

        webViewRef.current?.reload();
    };

    const domainLabel = useMemo(() => getDomainLabel(currentUrl), [currentUrl]);
    const securityLabel = useMemo(() => getSecureLabel(currentUrl), [currentUrl]);

    return (
        <SafeAreaView style={styles.container}>
            <StatusBar barStyle="light-content" backgroundColor="#0d0d1a" />

            <View style={styles.shell}>
                <View style={styles.titleBar}>
                    <View style={styles.windowButtons}>
                        <View style={[styles.windowButton, { backgroundColor: BROWSER_THEME.red }]} />
                        <View style={[styles.windowButton, { backgroundColor: BROWSER_THEME.yellow }]} />
                        <View style={[styles.windowButton, { backgroundColor: BROWSER_THEME.green }]} />
                    </View>

                    <View style={styles.brandWrap}>
                        <Text style={styles.brandTitle}>{APP_TITLE}</Text>
                        <View style={[styles.mobileBadge, mobileMode.demoMode && styles.demoBadge]}>
                            <Text style={[styles.mobileBadgeText, mobileMode.demoMode && styles.demoBadgeText]}>{APP_BADGE}</Text>
                        </View>
                    </View>

                    <View style={styles.statusChip}>
                        <Text style={styles.statusChipText}>{loading ? 'Loading' : securityLabel}</Text>
                    </View>
                </View>

                <View style={styles.metaBar}>
                    <View style={styles.metaPill}>
                        <Text style={styles.metaPillText}>{domainLabel}</Text>
                    </View>
                    <View style={styles.metaPill}>
                        <Text style={styles.metaPillText}>{tabs.length} tab{tabs.length === 1 ? '' : 's'}</Text>
                    </View>
                    <View style={styles.metaPillAccent}>
                        <Text style={styles.metaPillAccentText}>{mobileMode.demoMode ? `Demo · ${Platform.OS === 'ios' ? 'iPhone' : 'Android'}` : Platform.OS === 'ios' ? 'iPhone' : 'Android'}</Text>
                    </View>
                </View>

                <View style={styles.tabsBar}>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsScroller}>
                        {tabs.map((tab: Tab) => (
                            <TouchableOpacity
                                key={tab.id}
                                style={[styles.tab, activeTabId === tab.id && styles.activeTab]}
                                onPress={() => setActiveTabId(tab.id)}
                            >
                                <View style={styles.tabFaviconWrap}>
                                    {tab.faviconUrl ? (
                                        <Image source={{ uri: tab.faviconUrl }} style={styles.tabFavicon} />
                                    ) : (
                                        <Text style={styles.tabFaviconFallback}>🌐</Text>
                                    )}
                                </View>
                                <Text style={styles.tabTitle} numberOfLines={1}>
                                    {normalizeTabTitle(tab.title, tab.url)}
                                </Text>
                                {tabs.length > 1 && (
                                    <TouchableOpacity onPress={() => closeTab(tab.id)} style={styles.tabClose}>
                                        <Text style={styles.tabCloseText}>×</Text>
                                    </TouchableOpacity>
                                )}
                            </TouchableOpacity>
                        ))}
                    </ScrollView>

                    <TouchableOpacity style={styles.newTabBtn} onPress={createNewTab}>
                        <Text style={styles.newTabText}>＋</Text>
                    </TouchableOpacity>
                </View>

                <View style={styles.urlBar}>
                    <TouchableOpacity
                        style={[styles.navBtn, !canGoBack && styles.navBtnDisabled]}
                        onPress={() => webViewRef.current?.goBack()}
                        disabled={!canGoBack}
                    >
                        <Text style={styles.navBtnText}>←</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[styles.navBtn, !canGoForward && styles.navBtnDisabled]}
                        onPress={() => webViewRef.current?.goForward()}
                        disabled={!canGoForward}
                    >
                        <Text style={styles.navBtnText}>→</Text>
                    </TouchableOpacity>

                    <View style={styles.urlInputWrap}>
                        <Text style={styles.urlIcon}>{securityLabel === 'Secure' ? '🔒' : '🌐'}</Text>
                        <TextInput
                            style={styles.urlInput}
                            value={url}
                            onChangeText={setUrl}
                            onSubmitEditing={() => navigateTo(url)}
                            placeholder="Search or enter URL..."
                            placeholderTextColor={BROWSER_THEME.text3}
                            autoCapitalize="none"
                            autoCorrect={false}
                            keyboardType="url"
                            returnKeyType="go"
                        />
                    </View>

                    <TouchableOpacity style={styles.navBtn} onPress={handleReloadPress}>
                        <Text style={styles.navBtnText}>{loading ? '×' : '↻'}</Text>
                    </TouchableOpacity>
                </View>

                {loading && (
                    <View style={styles.loadingBar}>
                        <View style={[styles.loadingProgress, { width: `${loadingProgress * 100}%` }]} />
                    </View>
                )}

                <View style={styles.webviewFrame}>
                    <WebView
                        ref={webViewRef}
                        source={{ uri: activeTab?.url || INITIAL_URL }}
                        injectedJavaScript={injectedJavaScript}
                        onMessage={handleMessage}
                        onNavigationStateChange={(navState: WebViewNavigation) => {
                            setCanGoBack(navState.canGoBack);
                            setCanGoForward(navState.canGoForward);
                            setCurrentUrl(navState.url);
                            setUrl(navState.url);
                            setLoading(navState.loading);

                            // Add to history when navigation completes
                            if (!navState.loading && navState.url && navState.title) {
                                addHistory(navState.url, navState.title);
                            }

                            setTabs((prevTabs: Tab[]) =>
                                prevTabs.map((tab: Tab) =>
                                    tab.id === activeTabId
                                        ? {
                                            ...tab,
                                            title: normalizeTabTitle(navState.title, navState.url),
                                            url: navState.url,
                                            faviconUrl: buildFaviconUrl(navState.url),
                                        }
                                        : tab,
                                ),
                            );
                        }}
                        onLoadStart={() => {
                            setLoading(true);
                            setLoadingProgress(0);
                        }}
                        onLoadProgress={({ nativeEvent }) => {
                            setLoadingProgress(nativeEvent.progress);
                        }}
                        onLoadEnd={() => {
                            setLoading(false);
                            setLoadingProgress(1);
                        }}
                        javaScriptEnabled={true}
                        domStorageEnabled={true}
                        allowsInlineMediaPlayback={true}
                        mediaPlaybackRequiresUserAction={false}
                        allowFileAccess={true}
                        allowUniversalAccessFromFileURLs={true}
                        mixedContentMode="always"
                        style={styles.webview}
                        userAgent={
                            settings.customUserAgent ||
                            "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36 EtherXMobile/1.0"
                        }
                    />
                </View>

                <View style={styles.bottomBar}>
                    <TouchableOpacity style={styles.bottomAction} onPress={goHome}>
                        <Text style={styles.bottomActionIcon}>⌂</Text>
                        <Text style={styles.bottomActionText}>Home</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={styles.bottomAction}
                        onPress={() => setShowBookmarks(!showBookmarks)}
                    >
                        <Text style={styles.bottomActionIcon}>⭐</Text>
                        <Text style={styles.bottomActionText}>Marks</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={styles.bottomAction}
                        onPress={() => setShowHistory(!showHistory)}
                    >
                        <Text style={styles.bottomActionIcon}>🕐</Text>
                        <Text style={styles.bottomActionText}>History</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={styles.bottomAction}
                        onPress={() => setFindState({ ...findState, visible: !findState.visible })}
                    >
                        <Text style={styles.bottomActionIcon}>🔍</Text>
                        <Text style={styles.bottomActionText}>Find</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={styles.bottomAction}
                        onPress={() => setShowSettings(!showSettings)}
                    >
                        <Text style={styles.bottomActionIcon}>⚙️</Text>
                        <Text style={styles.bottomActionText}>Settings</Text>
                    </TouchableOpacity>
                </View>

                {/* Find Bar */}
                {findState.visible && (
                    <View style={styles.findBar}>
                        <TextInput
                            style={styles.findInput}
                            value={findState.query}
                            onChangeText={(text) => {
                                setFindState({ ...findState, query: text });
                                if (text) findInPage(text);
                            }}
                            placeholder="Find in page..."
                            placeholderTextColor={BROWSER_THEME.text3}
                            autoCapitalize="none"
                            autoCorrect={false}
                        />
                        <TouchableOpacity
                            style={styles.findBtn}
                            onPress={() => findInPage(findState.query, false)}
                        >
                            <Text style={styles.findBtnText}>↑</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={styles.findBtn}
                            onPress={() => findInPage(findState.query, true)}
                        >
                            <Text style={styles.findBtnText}>↓</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.findBtn} onPress={closeFindBar}>
                            <Text style={styles.findBtnText}>×</Text>
                        </TouchableOpacity>
                    </View>
                )}
            </View>

            {/* Bookmarks Panel */}
            <Modal
                visible={showBookmarks}
                animationType="slide"
                transparent={true}
                onRequestClose={() => setShowBookmarks(false)}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.panel}>
                        <View style={styles.panelHeader}>
                            <Text style={styles.panelTitle}>⭐ Bookmarks</Text>
                            <TouchableOpacity onPress={() => setShowBookmarks(false)}>
                                <Text style={styles.panelClose}>×</Text>
                            </TouchableOpacity>
                        </View>
                        <View style={styles.panelActions}>
                            <TouchableOpacity
                                style={styles.panelBtn}
                                onPress={() => {
                                    addBookmark();
                                    setShowBookmarks(false);
                                }}
                            >
                                <Text style={styles.panelBtnText}>+ Add Current Page</Text>
                            </TouchableOpacity>
                        </View>
                        <ScrollView style={styles.panelContent}>
                            {bookmarks.length === 0 ? (
                                <Text style={styles.emptyText}>No bookmarks yet</Text>
                            ) : (
                                bookmarks.map((bookmark) => (
                                    <View key={bookmark.id} style={styles.listItem}>
                                        <TouchableOpacity
                                            style={styles.listItemContent}
                                            onPress={() => {
                                                navigateTo(bookmark.url);
                                                setShowBookmarks(false);
                                            }}
                                        >
                                            <Text style={styles.listItemTitle} numberOfLines={1}>
                                                {bookmark.title}
                                            </Text>
                                            <Text style={styles.listItemUrl} numberOfLines={1}>
                                                {bookmark.url}
                                            </Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            style={styles.listItemDelete}
                                            onPress={() => removeBookmark(bookmark.id)}
                                        >
                                            <Text style={styles.listItemDeleteText}>×</Text>
                                        </TouchableOpacity>
                                    </View>
                                ))
                            )}
                        </ScrollView>
                    </View>
                </View>
            </Modal>

            {/* History Panel */}
            <Modal
                visible={showHistory}
                animationType="slide"
                transparent={true}
                onRequestClose={() => setShowHistory(false)}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.panel}>
                        <View style={styles.panelHeader}>
                            <Text style={styles.panelTitle}>🕐 History</Text>
                            <TouchableOpacity onPress={() => setShowHistory(false)}>
                                <Text style={styles.panelClose}>×</Text>
                            </TouchableOpacity>
                        </View>
                        <View style={styles.panelActions}>
                            <TouchableOpacity
                                style={styles.panelBtn}
                                onPress={() => {
                                    clearHistory();
                                }}
                            >
                                <Text style={styles.panelBtnText}>Clear All History</Text>
                            </TouchableOpacity>
                        </View>
                        <ScrollView style={styles.panelContent}>
                            {history.length === 0 ? (
                                <Text style={styles.emptyText}>No history yet</Text>
                            ) : (
                                history.map((entry) => (
                                    <TouchableOpacity
                                        key={entry.id}
                                        style={styles.listItem}
                                        onPress={() => {
                                            navigateTo(entry.url);
                                            setShowHistory(false);
                                        }}
                                    >
                                        <View style={styles.listItemContent}>
                                            <Text style={styles.listItemTitle} numberOfLines={1}>
                                                {entry.title}
                                            </Text>
                                            <Text style={styles.listItemUrl} numberOfLines={1}>
                                                {entry.url}
                                            </Text>
                                            <Text style={styles.listItemTime}>
                                                {new Date(entry.ts).toLocaleString()}
                                            </Text>
                                        </View>
                                    </TouchableOpacity>
                                ))
                            )}
                        </ScrollView>
                    </View>
                </View>
            </Modal>

            {/* Settings Panel */}
            <Modal
                visible={showSettings}
                animationType="slide"
                transparent={true}
                onRequestClose={() => setShowSettings(false)}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.panel}>
                        <View style={styles.panelHeader}>
                            <Text style={styles.panelTitle}>⚙️ Settings</Text>
                            <TouchableOpacity onPress={() => setShowSettings(false)}>
                                <Text style={styles.panelClose}>×</Text>
                            </TouchableOpacity>
                        </View>
                        <ScrollView style={styles.panelContent}>
                            <View style={styles.settingSection}>
                                <Text style={styles.settingLabel}>Search Engine</Text>
                                <View style={styles.settingOptions}>
                                    {(['google', 'duckduckgo', 'bing'] as const).map((engine) => (
                                        <TouchableOpacity
                                            key={engine}
                                            style={[
                                                styles.settingOption,
                                                settings.searchEngine === engine && styles.settingOptionActive,
                                            ]}
                                            onPress={() =>
                                                saveSettings({ ...settings, searchEngine: engine })
                                            }
                                        >
                                            <Text
                                                style={[
                                                    styles.settingOptionText,
                                                    settings.searchEngine === engine &&
                                                    styles.settingOptionTextActive,
                                                ]}
                                            >
                                                {engine === 'google'
                                                    ? 'Google'
                                                    : engine === 'duckduckgo'
                                                        ? 'DuckDuckGo'
                                                        : 'Bing'}
                                            </Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            </View>

                            <View style={styles.settingSection}>
                                <Text style={styles.settingLabel}>Theme</Text>
                                <View style={styles.settingOptions}>
                                    {(['dark', 'light'] as const).map((theme) => (
                                        <TouchableOpacity
                                            key={theme}
                                            style={[
                                                styles.settingOption,
                                                settings.theme === theme && styles.settingOptionActive,
                                            ]}
                                            onPress={() => saveSettings({ ...settings, theme })}
                                        >
                                            <Text
                                                style={[
                                                    styles.settingOptionText,
                                                    settings.theme === theme &&
                                                    styles.settingOptionTextActive,
                                                ]}
                                            >
                                                {theme === 'dark' ? '🌙 Dark' : '☀️ Light'}
                                            </Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            </View>

                            <View style={styles.settingSection}>
                                <Text style={styles.settingLabel}>Custom User Agent (optional)</Text>
                                <TextInput
                                    style={styles.settingInput}
                                    value={settings.customUserAgent || ''}
                                    onChangeText={(text) =>
                                        saveSettings({ ...settings, customUserAgent: text })
                                    }
                                    placeholder="Leave empty for default"
                                    placeholderTextColor={BROWSER_THEME.text3}
                                    multiline
                                />
                            </View>

                            <View style={styles.settingSection}>
                                <Text style={styles.settingInfo}>
                                    EtherX Mobile v1.0.0{'\n'}
                                    Platform: {Platform.OS === 'ios' ? 'iOS' : 'Android'}{'\n'}
                                    Bookmarks: {bookmarks.length}{'\n'}
                                    History: {history.length}
                                </Text>
                            </View>
                        </ScrollView>
                    </View>
                </View>
            </Modal>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#0d0d1a',
    },
    shell: {
        flex: 1,
        backgroundColor: BROWSER_THEME.bg,
    },
    titleBar: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: BROWSER_THEME.bg2,
        borderBottomWidth: 1,
        borderBottomColor: BROWSER_THEME.border,
        paddingHorizontal: 12,
        paddingVertical: 10,
    },
    windowButtons: {
        flexDirection: 'row',
        gap: 6,
    },
    windowButton: {
        width: 12,
        height: 12,
        borderRadius: 999,
    },
    brandWrap: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    brandTitle: {
        color: BROWSER_THEME.text,
        fontSize: 14,
        fontWeight: '700',
    },
    mobileBadge: {
        backgroundColor: BROWSER_THEME.bg3,
        borderWidth: 1,
        borderColor: BROWSER_THEME.border,
        borderRadius: 8,
        paddingHorizontal: 8,
        paddingVertical: 3,
    },
    mobileBadgeText: {
        color: BROWSER_THEME.accent,
        fontSize: 11,
        fontWeight: '700',
    },
    demoBadge: {
        backgroundColor: BROWSER_THEME.accent2,
        borderColor: '#8b5cf6',
    },
    demoBadgeText: {
        color: '#fff',
    },
    statusChip: {
        minWidth: 70,
        alignItems: 'center',
        backgroundColor: BROWSER_THEME.bg3,
        borderWidth: 1,
        borderColor: BROWSER_THEME.border,
        borderRadius: 999,
        paddingHorizontal: 10,
        paddingVertical: 5,
    },
    statusChipText: {
        color: BROWSER_THEME.text,
        fontSize: 12,
        fontWeight: '600',
    },
    metaBar: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: 12,
        paddingVertical: 8,
        backgroundColor: BROWSER_THEME.bg,
        borderBottomWidth: 1,
        borderBottomColor: BROWSER_THEME.border,
    },
    metaPill: {
        backgroundColor: BROWSER_THEME.bg2,
        borderWidth: 1,
        borderColor: BROWSER_THEME.border,
        borderRadius: 999,
        paddingHorizontal: 10,
        paddingVertical: 5,
    },
    metaPillAccent: {
        backgroundColor: BROWSER_THEME.bg3,
        borderWidth: 1,
        borderColor: BROWSER_THEME.border2,
        borderRadius: 999,
        paddingHorizontal: 10,
        paddingVertical: 5,
        marginLeft: 'auto',
    },
    metaPillText: {
        color: BROWSER_THEME.text2,
        fontSize: 11,
        fontWeight: '600',
    },
    metaPillAccentText: {
        color: '#fff',
        fontSize: 11,
        fontWeight: '700',
    },
    tabsBar: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: BROWSER_THEME.bg2,
        borderBottomWidth: 1,
        borderBottomColor: BROWSER_THEME.border,
        minHeight: 48,
        paddingVertical: 6,
        paddingLeft: 10,
        paddingRight: 8,
    },
    tabsScroller: {
        alignItems: 'center',
        paddingRight: 8,
    },
    tab: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 10,
        paddingVertical: 8,
        backgroundColor: BROWSER_THEME.bg,
        marginRight: 6,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: BROWSER_THEME.border,
        minWidth: 132,
        maxWidth: 186,
    },
    activeTab: {
        backgroundColor: '#252535',
        borderColor: BROWSER_THEME.accent,
    },
    tabFaviconWrap: {
        width: 18,
        height: 18,
        borderRadius: 9,
        marginRight: 8,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
    },
    tabFavicon: {
        width: 16,
        height: 16,
        borderRadius: 8,
    },
    tabFaviconFallback: {
        fontSize: 13,
    },
    tabTitle: {
        flex: 1,
        color: BROWSER_THEME.text,
        fontSize: 12,
    },
    tabClose: {
        marginLeft: 8,
        paddingHorizontal: 4,
    },
    tabCloseText: {
        color: BROWSER_THEME.text2,
        fontSize: 16,
        fontWeight: '700',
    },
    newTabBtn: {
        width: 34,
        height: 34,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: BROWSER_THEME.bg3,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: BROWSER_THEME.border,
    },
    newTabText: {
        color: BROWSER_THEME.accent,
        fontSize: 18,
        fontWeight: '700',
    },
    urlBar: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: BROWSER_THEME.bg,
        paddingHorizontal: 10,
        paddingVertical: 10,
        borderBottomWidth: 1,
        borderBottomColor: BROWSER_THEME.border,
    },
    navBtn: {
        width: 38,
        height: 38,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: BROWSER_THEME.bg2,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: BROWSER_THEME.border,
        marginRight: 6,
    },
    navBtnDisabled: {
        opacity: 0.3,
    },
    navBtnText: {
        fontSize: 18,
        color: BROWSER_THEME.text,
        fontWeight: '700',
    },
    urlInputWrap: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: BROWSER_THEME.bg2,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: BROWSER_THEME.border,
        paddingHorizontal: 10,
        marginRight: 6,
    },
    urlIcon: {
        fontSize: 13,
        marginRight: 8,
    },
    urlInput: {
        flex: 1,
        height: 42,
        color: BROWSER_THEME.text,
        fontSize: 14,
    },
    loadingBar: {
        height: 3,
        backgroundColor: BROWSER_THEME.border,
    },
    loadingProgress: {
        height: '100%',
        backgroundColor: BROWSER_THEME.accent,
    },
    webviewFrame: {
        flex: 1,
        backgroundColor: BROWSER_THEME.bg,
        borderTopWidth: 1,
        borderTopColor: 'rgba(255,255,255,0.03)',
    },
    webview: {
        flex: 1,
        backgroundColor: '#0d0d1a',
    },
    bottomBar: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: BROWSER_THEME.bg2,
        borderTopWidth: 1,
        borderTopColor: BROWSER_THEME.border,
        paddingHorizontal: 12,
        paddingVertical: 10,
    },
    bottomAction: {
        alignItems: 'center',
        minWidth: 60,
    },
    bottomActionIcon: {
        color: BROWSER_THEME.text,
        fontSize: 18,
        fontWeight: '700',
    },
    bottomActionText: {
        color: BROWSER_THEME.text2,
        fontSize: 11,
        marginTop: 2,
    },
    bottomTabsPill: {
        minWidth: 42,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: BROWSER_THEME.accent,
        borderRadius: 999,
        paddingHorizontal: 14,
        paddingVertical: 8,
    },
    bottomTabsPillText: {
        color: '#fff',
        fontSize: 14,
        fontWeight: '700',
    },
    findBar: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: BROWSER_THEME.bg2,
        borderTopWidth: 1,
        borderTopColor: BROWSER_THEME.border,
        paddingHorizontal: 12,
        paddingVertical: 8,
        gap: 6,
    },
    findInput: {
        flex: 1,
        height: 38,
        backgroundColor: BROWSER_THEME.bg,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: BROWSER_THEME.border,
        paddingHorizontal: 12,
        color: BROWSER_THEME.text,
        fontSize: 14,
    },
    findBtn: {
        width: 38,
        height: 38,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: BROWSER_THEME.bg,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: BROWSER_THEME.border,
    },
    findBtnText: {
        color: BROWSER_THEME.text,
        fontSize: 16,
        fontWeight: '700',
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.85)',
        justifyContent: 'flex-end',
    },
    panel: {
        backgroundColor: BROWSER_THEME.bg,
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        maxHeight: '80%',
        borderTopWidth: 1,
        borderLeftWidth: 1,
        borderRightWidth: 1,
        borderColor: BROWSER_THEME.border,
    },
    panelHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingVertical: 16,
        borderBottomWidth: 1,
        borderBottomColor: BROWSER_THEME.border,
    },
    panelTitle: {
        color: BROWSER_THEME.text,
        fontSize: 18,
        fontWeight: '700',
    },
    panelClose: {
        color: BROWSER_THEME.text2,
        fontSize: 32,
        fontWeight: '300',
    },
    panelActions: {
        paddingHorizontal: 20,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: BROWSER_THEME.border,
    },
    panelBtn: {
        backgroundColor: BROWSER_THEME.accent,
        borderRadius: 10,
        paddingVertical: 12,
        paddingHorizontal: 16,
        alignItems: 'center',
    },
    panelBtnText: {
        color: '#fff',
        fontSize: 14,
        fontWeight: '700',
    },
    panelContent: {
        flex: 1,
        paddingHorizontal: 20,
        paddingVertical: 12,
    },
    emptyText: {
        color: BROWSER_THEME.text3,
        fontSize: 14,
        textAlign: 'center',
        paddingVertical: 40,
    },
    listItem: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: BROWSER_THEME.bg2,
        borderRadius: 10,
        marginBottom: 10,
        borderWidth: 1,
        borderColor: BROWSER_THEME.border,
        overflow: 'hidden',
    },
    listItemContent: {
        flex: 1,
        paddingHorizontal: 14,
        paddingVertical: 12,
    },
    listItemTitle: {
        color: BROWSER_THEME.text,
        fontSize: 14,
        fontWeight: '600',
        marginBottom: 4,
    },
    listItemUrl: {
        color: BROWSER_THEME.text2,
        fontSize: 12,
    },
    listItemTime: {
        color: BROWSER_THEME.text3,
        fontSize: 10,
        marginTop: 4,
    },
    listItemDelete: {
        width: 50,
        height: '100%',
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: BROWSER_THEME.red,
    },
    listItemDeleteText: {
        color: '#fff',
        fontSize: 24,
        fontWeight: '700',
    },
    settingSection: {
        marginBottom: 24,
    },
    settingLabel: {
        color: BROWSER_THEME.text,
        fontSize: 14,
        fontWeight: '700',
        marginBottom: 10,
    },
    settingOptions: {
        flexDirection: 'row',
        gap: 10,
        flexWrap: 'wrap',
    },
    settingOption: {
        paddingHorizontal: 16,
        paddingVertical: 10,
        backgroundColor: BROWSER_THEME.bg2,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: BROWSER_THEME.border,
    },
    settingOptionActive: {
        backgroundColor: BROWSER_THEME.accent,
        borderColor: BROWSER_THEME.accent,
    },
    settingOptionText: {
        color: BROWSER_THEME.text2,
        fontSize: 13,
        fontWeight: '600',
    },
    settingOptionTextActive: {
        color: '#fff',
    },
    settingInput: {
        backgroundColor: BROWSER_THEME.bg2,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: BROWSER_THEME.border,
        paddingHorizontal: 14,
        paddingVertical: 12,
        color: BROWSER_THEME.text,
        fontSize: 13,
        minHeight: 80,
        textAlignVertical: 'top',
    },
    settingInfo: {
        color: BROWSER_THEME.text3,
        fontSize: 12,
        lineHeight: 20,
    },
});
