import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import { BackHandler, Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { WebView, type WebViewNavigation } from 'react-native-webview';
import ProfileScreen from './shared-mobile/app/(tabs)/profile';
import { useI18n } from './shared-mobile/src/i18n/I18nProvider';
import type { MessageKey } from './shared-mobile/src/i18n/i18n-core';

type TabKey = 'data' | 'community' | 'bia' | 'knowledge' | 'profile';

type AppTab = {
  key: TabKey;
  icon: string;
  label: string;
  labelKey: MessageKey;
  accessibilityLabel: string;
  url: string;
};

const TABS: AppTab[] = [
  {
    key: 'data',
    icon: '院',
    label: '移民法院数据',
    labelKey: 'asylumApp.tabData',
    accessibilityLabel: '移民法院数据',
    url: 'https://asylumjudge.com/'
  },
  {
    key: 'community',
    icon: '区',
    label: '社区',
    labelKey: 'asylumApp.tabCommunity',
    accessibilityLabel: '移民社区',
    url: 'https://trrb.net/community/?app=1'
  },
  {
    key: 'bia',
    icon: '判',
    label: 'BIA裁决',
    labelKey: 'asylumApp.tabBia',
    accessibilityLabel: 'BIA 裁决',
    url: 'https://trrb.net/legal/?app=1&source=asylumjudge'
  },
  {
    key: 'knowledge',
    icon: '知',
    label: '庇护知识',
    labelKey: 'asylumApp.tabKnowledge',
    accessibilityLabel: '庇护知识',
    url: 'https://trrb.net/immigrate/center?path=humanitarian&app=1'
  },
  {
    key: 'profile',
    icon: '我',
    label: '我的中心',
    labelKey: 'asylumApp.tabProfile',
    accessibilityLabel: '我的中心',
    url: 'https://trrb.net/community/?app=1&account=1'
  }
];

const TRUSTED_HOSTS = new Set([
  'asylumjudge.com',
  'www.asylumjudge.com',
  'trrb.net',
  'www.trrb.net'
]);

// The content pages remain the production single source of truth, while this
// script removes desktop chrome and applies a native-app mobile presentation.
const NATIVE_APP_SCRIPT = `
(() => {
  const root = document.documentElement;
  const host = window.location.hostname.toLowerCase();
  const path = window.location.pathname.replace(/\\/+$/, '') || '/';
  const params = new URLSearchParams(window.location.search);
  root.classList.add('asylumjudge-native-app');
  if (!document.querySelector('meta[name="viewport"]')) {
    const viewport = document.createElement('meta');
    viewport.name = 'viewport';
    viewport.content = 'width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover';
    document.head.appendChild(viewport);
  }
  if (host === 'asylumjudge.com' || host === 'www.asylumjudge.com') root.classList.add('asylumjudge-data-home');
  if ((host === 'trrb.net' || host === 'www.trrb.net') && path.startsWith('/legal')) root.classList.add('asylumjudge-legal-page');

  if (path === '/community' || path === '/asylumjudge/community') {
    root.classList.add('app-embedded', 'asylumjudge-community-page');
  }
  if ((host === 'trrb.net' || host === 'www.trrb.net') && path.startsWith('/immigrate')) root.classList.add('asylumjudge-knowledge-page');

  let style = document.getElementById('asylumjudge-native-app-styles');
  if (!style) {
    style = document.createElement('style');
    style.id = 'asylumjudge-native-app-styles';
  }
  style.textContent = \`
    html.asylumjudge-native-app { background: #f4f8f5 !important; -webkit-text-size-adjust: 100% !important; overscroll-behavior-y: contain; }
    html.asylumjudge-native-app body { font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", sans-serif !important; font-size: 16px !important; line-height: 1.55 !important; -webkit-font-smoothing: antialiased; }
    html.asylumjudge-native-app a, html.asylumjudge-native-app button, html.asylumjudge-native-app select { touch-action: manipulation; }
    html.asylumjudge-native-app a:active, html.asylumjudge-native-app button:active { opacity: .76 !important; transform: scale(.985); }
    html.asylumjudge-native-app input, html.asylumjudge-native-app select { font-size: 16px !important; }
    html.asylumjudge-native-app.asylumjudge-data-home main { padding-top: 10px !important; }
    html.asylumjudge-native-app.asylumjudge-data-home section { scroll-margin-top: 12px; }
    html.asylumjudge-native-app.asylumjudge-data-home .site-header:has(.brand-lockup) { box-shadow: 0 1px 0 rgba(20,128,74,.10) !important; }
    html.asylumjudge-native-app.asylumjudge-data-home .card,
    html.asylumjudge-native-app.asylumjudge-data-home .panel { border-radius: 16px !important; }
    html.asylumjudge-native-app.asylumjudge-data-home .state-market { padding: 18px 16px 16px !important; }
    html.asylumjudge-native-app.asylumjudge-data-home .state-market-head span { font-size: 11px !important; line-height: 1.45 !important; }
    html.asylumjudge-native-app.asylumjudge-data-home .state-market-head b { font-size: 17px !important; line-height: 1.4 !important; margin-top: 4px !important; }
    html.asylumjudge-native-app.asylumjudge-data-home .state-market-head small { font-size: 12px !important; line-height: 1.55 !important; margin-top: 5px !important; }
    html.asylumjudge-native-app.asylumjudge-data-home .trend-interval-tabs { gap: 8px !important; }
    html.asylumjudge-native-app.asylumjudge-data-home .trend-interval-tabs button { min-height: 48px !important; font-size: 13px !important; padding: 8px 13px !important; }
    html.asylumjudge-native-app.asylumjudge-data-home .state-market-legend { gap: 8px !important; font-size: 12px !important; line-height: 1.45 !important; }
    html.asylumjudge-native-app.asylumjudge-data-home .market-touch-hint { font-size: 11px !important; line-height: 1.55 !important; margin-top: 7px !important; }
    html.asylumjudge-native-app.asylumjudge-data-home .trend-scope-controls { gap: 13px !important; margin-top: 13px !important; }
    html.asylumjudge-native-app.asylumjudge-data-home .trend-scope-controls label { gap: 7px !important; font-size: 13px !important; line-height: 1.45 !important; }
    html.asylumjudge-native-app.asylumjudge-data-home .trend-scope-controls select { min-height: 50px !important; font-size: 15px !important; padding: 10px 34px 10px 12px !important; }
    html.asylumjudge-native-app.asylumjudge-data-home .state-trend-states { gap: 9px !important; margin-top: 14px !important; }
    html.asylumjudge-native-app.asylumjudge-data-home .state-trend-states > span { font-size: 13px !important; line-height: 1.45 !important; }
    html.asylumjudge-native-app.asylumjudge-data-home .state-trend-states button { min-height: 48px !important; font-size: 14px !important; line-height: 1.35 !important; }
    html.asylumjudge-native-app.asylumjudge-data-home .state-trend-detail { gap: 11px 14px !important; font-size: 13px !important; line-height: 1.45 !important; }
    html.asylumjudge-native-app.asylumjudge-data-home .state-trend-detail strong { font-size: 15px !important; }
    @media (max-width: 520px) {
      html.asylumjudge-native-app.asylumjudge-data-home .site-header:has(.brand-lockup) .header-inner { min-height: 60px !important; padding: 7px 12px !important; }
      html.asylumjudge-native-app.asylumjudge-data-home .site-header:has(.brand-lockup) .brand-lockup { max-width: 184px !important; }
      html.asylumjudge-native-app.asylumjudge-data-home main,
      html.asylumjudge-native-app.asylumjudge-data-home .container,
      html.asylumjudge-native-app.asylumjudge-data-home .shell { padding-left: 10px !important; padding-right: 10px !important; }
      html.asylumjudge-native-app.asylumjudge-data-home .card,
      html.asylumjudge-native-app.asylumjudge-data-home .panel { padding: 16px !important; margin-bottom: 12px !important; }
      html.asylumjudge-native-app.asylumjudge-data-home h1 { font-size: 26px !important; line-height: 1.18 !important; }
      html.asylumjudge-native-app.asylumjudge-data-home h2 { font-size: 20px !important; line-height: 1.25 !important; }
    }
    html.asylumjudge-native-app body { min-width: 0 !important; overflow-x: hidden !important; }
    html.asylumjudge-native-app * { -webkit-tap-highlight-color: transparent; }
    html.asylumjudge-native-app button,
    html.asylumjudge-native-app a,
    html.asylumjudge-native-app input,
    html.asylumjudge-native-app select { min-height: 44px; }
    html.asylumjudge-native-app .topbar,
    html.asylumjudge-native-app header.site-header:not(:has(.brand-lockup)),
    html.asylumjudge-native-app nav.nav,
    html.asylumjudge-native-app footer.footer { display: none !important; }
    html.asylumjudge-native-app.asylumjudge-legal-page .legal-header,
    html.asylumjudge-native-app.asylumjudge-legal-page .hero > .eyebrow,
    html.asylumjudge-native-app.asylumjudge-legal-page .hero > p:not(.eyebrow) { display: none !important; }
    html.asylumjudge-native-app.asylumjudge-legal-page main.wrap { padding-top: 0 !important; }
    html.asylumjudge-native-app.asylumjudge-legal-page .hero { padding: 14px 0 18px !important; }
    html.asylumjudge-native-app.asylumjudge-legal-page .hero h1 { margin: 0 !important; font-size: 32px !important; line-height: 1.25 !important; }
    html.asylumjudge-native-app.asylumjudge-legal-page .source-tabs { gap: 12px !important; margin-bottom: 22px !important; }
    html.asylumjudge-native-app.asylumjudge-legal-page .source-tabs button { min-height: 50px !important; font-size: 15px !important; line-height: 1.35 !important; }
    html.asylumjudge-native-app.asylumjudge-legal-page .filters { gap: 16px !important; padding: 18px !important; }
    html.asylumjudge-native-app.asylumjudge-legal-page .filters label { gap: 9px !important; font-size: 14px !important; line-height: 1.4 !important; }
    html.asylumjudge-native-app.asylumjudge-legal-page .filters input,
    html.asylumjudge-native-app.asylumjudge-legal-page .filters select,
    html.asylumjudge-native-app.asylumjudge-legal-page .filters button { min-height: 50px !important; height: 50px !important; font-size: 16px !important; line-height: 1.4 !important; }
    @media (max-width: 600px) {
      html.asylumjudge-native-app.asylumjudge-legal-page main.wrap { width: calc(100% - 28px) !important; }
      html.asylumjudge-native-app.asylumjudge-legal-page .source-tabs { gap: 8px !important; margin-bottom: 14px !important; }
      html.asylumjudge-native-app.asylumjudge-legal-page .source-tabs button { min-height: 44px !important; padding: 8px 6px !important; font-size: 14px !important; }
      html.asylumjudge-native-app.asylumjudge-legal-page .filters {
        grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
        grid-template-areas: "query query" "source body" "type sort" "from to" "reset reset" !important;
        gap: 12px 10px !important;
        padding: 14px !important;
        border-radius: 16px !important;
      }
      html.asylumjudge-native-app.asylumjudge-legal-page .filters label { gap: 6px !important; min-width: 0 !important; font-size: 13px !important; }
      html.asylumjudge-native-app.asylumjudge-legal-page .filters label:nth-of-type(1) { grid-area: query; }
      html.asylumjudge-native-app.asylumjudge-legal-page .filters label:nth-of-type(2) { grid-area: source; }
      html.asylumjudge-native-app.asylumjudge-legal-page .filters label:nth-of-type(3) { grid-area: body; }
      html.asylumjudge-native-app.asylumjudge-legal-page .filters label:nth-of-type(4) { grid-area: type; }
      html.asylumjudge-native-app.asylumjudge-legal-page .filters label:nth-of-type(5) { grid-area: from; }
      html.asylumjudge-native-app.asylumjudge-legal-page .filters label:nth-of-type(6) { grid-area: to; }
      html.asylumjudge-native-app.asylumjudge-legal-page .filters label:nth-of-type(7) { grid-area: sort; }
      html.asylumjudge-native-app.asylumjudge-legal-page .filters input,
      html.asylumjudge-native-app.asylumjudge-legal-page .filters select,
      html.asylumjudge-native-app.asylumjudge-legal-page .filters button { min-width: 0 !important; min-height: 46px !important; height: 46px !important; padding-left: 10px !important; padding-right: 10px !important; font-size: 14px !important; }
      html.asylumjudge-native-app.asylumjudge-legal-page .filters #legal-reset { grid-area: reset; color: #14804a !important; border-color: #b9d5c5 !important; background: #f2f8f4 !important; }
      html.asylumjudge-native-app.asylumjudge-legal-page .status-row { padding-top: 16px !important; }
    }
    html.asylumjudge-native-app.asylumjudge-community-page body,
    html.asylumjudge-native-app.asylumjudge-knowledge-page body { background: #f4f8f5 !important; color: #102019 !important; }
    html.asylumjudge-native-app.asylumjudge-community-page {
      --ink: #102019;
      --muted: #5f6f67;
      --line: #d4ddd7;
      --paper: #ffffff;
      --wash: #f4f8f5;
      --red: #14804a;
      --red-dark: #0d6b3d;
      --green: #14804a;
      --shadow: 0 14px 36px rgba(16, 32, 25, .09);
    }
    html.asylumjudge-native-app.asylumjudge-community-page .hero {
      background: linear-gradient(135deg, #f8fcf9 0%, #edf8f1 58%, #deefe5 100%) !important;
      border-bottom-color: #d4e5da !important;
    }
    html.asylumjudge-native-app.asylumjudge-community-page .eyebrow,
    html.asylumjudge-native-app.asylumjudge-community-page .category,
    html.asylumjudge-native-app.asylumjudge-community-page .badge.category,
    html.asylumjudge-native-app.asylumjudge-community-page .likedCount { color: #14804a !important; }
    html.asylumjudge-native-app.asylumjudge-community-page button,
    html.asylumjudge-native-app.asylumjudge-community-page .hero-actions button { background: #14804a !important; color: #ffffff !important; }
    html.asylumjudge-native-app.asylumjudge-community-page .secondary,
    html.asylumjudge-native-app.asylumjudge-community-page .text-button,
    html.asylumjudge-native-app.asylumjudge-community-page .hero-actions a,
    html.asylumjudge-native-app.asylumjudge-community-page .post-actions button {
      background: #ffffff !important;
      color: #102019 !important;
      border-color: #c9d8cf !important;
    }
    html.asylumjudge-native-app.asylumjudge-community-page .category-grid button {
      background: #ffffff !important;
      color: #102019 !important;
      border-color: #d4ddd7 !important;
      box-shadow: 0 5px 18px rgba(16, 32, 25, .035) !important;
    }
    html.asylumjudge-native-app.asylumjudge-community-page .category-grid button.featured,
    html.asylumjudge-native-app.asylumjudge-community-page .category-grid button.active {
      background: #eef8f2 !important;
      border-color: #a9cfb8 !important;
    }
    html.asylumjudge-native-app.asylumjudge-community-page .category-grid button:hover { border-color: #14804a !important; }
    html.asylumjudge-native-app.asylumjudge-community-page .badge.category,
    html.asylumjudge-native-app.asylumjudge-community-page .likedButton { background: #e6f4eb !important; }
    html.asylumjudge-native-app.asylumjudge-community-page .avatar { background: #e6f4eb !important; color: #0d6b3d !important; }
    html.asylumjudge-native-app.asylumjudge-community-page .hero h1,
    html.asylumjudge-native-app.asylumjudge-community-page .section-head h2,
    html.asylumjudge-native-app.asylumjudge-community-page .feed-toolbar h2 { color: #102019 !important; }
    html.asylumjudge-native-app.asylumjudge-community-page .hero h1 + p,
    html.asylumjudge-native-app.asylumjudge-community-page .category-grid small,
    html.asylumjudge-native-app.asylumjudge-community-page .notice { color: #5f6f67 !important; }
    html.asylumjudge-native-app.asylumjudge-knowledge-page .knowledge-top { display: none !important; }
    html.asylumjudge-native-app.asylumjudge-knowledge-page .center-hero {
      padding: 30px 0 28px !important;
      background: linear-gradient(135deg, #0d6b3d 0%, #14804a 58%, #2b9862 100%) !important;
      color: #ffffff !important;
    }
    html.asylumjudge-native-app.asylumjudge-knowledge-page .center-layout { padding-top: 22px !important; padding-bottom: 44px !important; gap: 18px !important; }
    html.asylumjudge-native-app.asylumjudge-knowledge-page .center-sidebar,
    html.asylumjudge-native-app.asylumjudge-knowledge-page .topic-overview,
    html.asylumjudge-native-app.asylumjudge-knowledge-page .topic-card,
    html.asylumjudge-native-app.asylumjudge-knowledge-page .article-item {
      border-color: #d4ddd7 !important;
      background: #ffffff !important;
      box-shadow: 0 6px 20px rgba(16, 32, 25, .045) !important;
    }
    html.asylumjudge-native-app.asylumjudge-knowledge-page .center-sidebar a { color: #34483d !important; }
    html.asylumjudge-native-app.asylumjudge-knowledge-page .center-sidebar a:hover,
    html.asylumjudge-native-app.asylumjudge-knowledge-page .center-sidebar a.is-current {
      background: #e6f4eb !important;
      color: #0d6b3d !important;
    }
    html.asylumjudge-native-app.asylumjudge-knowledge-page .topic-card:hover { border-color: #14804a !important; }
    html.asylumjudge-native-app.asylumjudge-knowledge-page .knowledge-structure header p,
    html.asylumjudge-native-app.asylumjudge-knowledge-page .related-articles header p,
    html.asylumjudge-native-app.asylumjudge-knowledge-page .article-item small,
    html.asylumjudge-native-app.asylumjudge-knowledge-page .article-item a { color: #14804a !important; }
    html.asylumjudge-native-app.asylumjudge-knowledge-page .knowledge-step {
      border-left-color: #14804a !important;
      background: #eef8f2 !important;
    }
    html.asylumjudge-native-app.asylumjudge-knowledge-page .topic-overview p,
    html.asylumjudge-native-app.asylumjudge-knowledge-page .topic-card span,
    html.asylumjudge-native-app.asylumjudge-knowledge-page .knowledge-step small,
    html.asylumjudge-native-app.asylumjudge-knowledge-page .article-item p { color: #5f6f67 !important; }
    @media (max-width: 640px) {
      html.asylumjudge-native-app.asylumjudge-community-page .hero h1 { font-size: 27px !important; line-height: 1.2 !important; }
      html.asylumjudge-native-app.asylumjudge-community-page .hero-actions { gap: 10px !important; }
      html.asylumjudge-native-app.asylumjudge-community-page .hero-actions button,
      html.asylumjudge-native-app.asylumjudge-community-page .hero-actions a { min-width: 0 !important; padding: 10px 14px !important; }
      html.asylumjudge-native-app.asylumjudge-knowledge-page .center-hero { padding: 26px 0 24px !important; }
      html.asylumjudge-native-app.asylumjudge-knowledge-page .center-hero h1 { font-size: 30px !important; }
      html.asylumjudge-native-app.asylumjudge-knowledge-page .center-layout { padding-left: 12px !important; padding-right: 12px !important; }
      html.asylumjudge-native-app.asylumjudge-knowledge-page .center-sidebar { padding: 18px !important; border-radius: 16px !important; }
    }
    html.asylumjudge-native-app .immigration-hero,
    html.asylumjudge-native-app .legal-hero { padding-top: 18px !important; padding-bottom: 18px !important; }
    html.asylumjudge-native-app .container,
    html.asylumjudge-native-app .shell { width: min(100%, 760px) !important; max-width: 760px !important; margin-left: auto !important; margin-right: auto !important; }
    html.asylumjudge-native-app .site-header:has(.brand-lockup) { position: sticky !important; top: 0 !important; z-index: 50 !important; }
    html.asylumjudge-native-app .site-header:has(.brand-lockup) .home-nav { display: none !important; }
    html.asylumjudge-native-app .site-header:has(.brand-lockup) .header-inner { min-height: 66px !important; padding: 9px 14px !important; }
    html.asylumjudge-native-app .site-header:has(.brand-lockup) .brand-lockup { max-width: 210px !important; height: auto !important; }
    html.asylumjudge-native-app .hero-grid { padding-top: 14px !important; }
    html.asylumjudge-native-app .community-layout { padding-top: 8px !important; }
  \`;
  (document.head || document.documentElement).appendChild(style);

  const applyNativePresentation = () => {
    root.classList.add('asylumjudge-native-app');
    if ((host === 'trrb.net' || host === 'www.trrb.net') && path.startsWith('/legal')) {
      root.classList.add('asylumjudge-legal-page');
      document.querySelectorAll('.legal-header, .hero > .eyebrow, .hero > p:not(.eyebrow)').forEach((element) => {
        element.style.setProperty('display', 'none', 'important');
      });
    }
  };
  applyNativePresentation();
  if (!window.__asylumJudgeNativeObserver) {
    const observer = new MutationObserver(applyNativePresentation);
    observer.observe(document.documentElement, { childList: true, subtree: true });
    window.__asylumJudgeNativeObserver = observer;
  }

  if (params.get('account') === '1') {
    const openAccount = () => {
      const button = document.querySelector('#login-open');
      if (button && !button.classList.contains('hidden')) button.click();
    };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => setTimeout(openAccount, 120), { once: true });
    } else {
      setTimeout(openAccount, 120);
    }
  }
})();
true;
`;

function isTrustedWebUrl(url: string) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && TRUSTED_HOSTS.has(parsed.hostname.toLowerCase());
  } catch {
    return false;
  }
}

function tabFromUrl(url: string): TabKey | null {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    const path = parsed.pathname.replace(/\/+$/, '') || '/';
    if (host === 'asylumjudge.com' || host === 'www.asylumjudge.com') return 'data';
    if (path === '/community' && parsed.searchParams.get('account') === '1') return 'profile';
    if (path === '/community') return 'community';
    if (path === '/legal') return 'bia';
    if (path.startsWith('/immigrate')) return 'knowledge';
    return null;
  } catch {
    return null;
  }
}

function AsylumJudgeApp() {
  const { t } = useI18n();
  const webViewRef = useRef<WebView>(null);
  const [activeTab, setActiveTab] = useState<TabKey>('data');
  const [sourceUrl, setSourceUrl] = useState(TABS[0].url);
  const [canGoBack, setCanGoBack] = useState(false);
  const [loadProgress, setLoadProgress] = useState(0);
  const [failed, setFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const goBack = useCallback(() => {
    if (!canGoBack) return false;
    webViewRef.current?.goBack();
    return true;
  }, [canGoBack]);

  useEffect(() => {
    if (Platform.OS !== 'android') return undefined;
    const subscription = BackHandler.addEventListener('hardwareBackPress', goBack);
    return () => subscription.remove();
  }, [goBack]);

  const openUrl = useCallback((url: string) => {
    if (url === 'about:blank' || isTrustedWebUrl(url)) return true;
    if (/^(mailto:|tel:|sms:)/i.test(url) || /^https?:/i.test(url)) void Linking.openURL(url);
    return false;
  }, []);

  const selectTab = useCallback((tab: AppTab) => {
    setFailed(false);
    setCanGoBack(false);
    setLoadProgress(0);
    setActiveTab(tab.key);
    setSourceUrl(tab.url);
    setReloadKey((value) => value + 1);
  }, []);

  const retry = useCallback(() => {
    setFailed(false);
    setLoadProgress(0);
    setReloadKey((value) => value + 1);
  }, []);

  const trackNavigation = useCallback((state: WebViewNavigation) => {
    setCanGoBack(state.canGoBack);
    const nextTab = tabFromUrl(state.url);
    if (nextTab) setActiveTab(nextTab);
  }, []);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <StatusBar style="dark" />

      <View style={styles.content}>
        {activeTab === 'profile' ? (
          <ProfileScreen />
        ) : <>
        {loadProgress > 0 && loadProgress < 1 ? (
          <View style={styles.progressTrack} accessibilityLabel="页面加载中">
            <View style={[styles.progressBar, { width: `${Math.max(8, loadProgress * 100)}%` }]} />
          </View>
        ) : null}

        <WebView
          key={`${activeTab}-${reloadKey}`}
          ref={webViewRef}
          source={{ uri: sourceUrl }}
          style={styles.webView}
          originWhitelist={['https://*', 'mailto:*', 'tel:*', 'sms:*']}
          javaScriptEnabled
          domStorageEnabled
          sharedCookiesEnabled
          thirdPartyCookiesEnabled
          allowsBackForwardNavigationGestures
          automaticallyAdjustContentInsets={false}
          pullToRefreshEnabled
          bounces
          decelerationRate="fast"
          contentInsetAdjustmentBehavior="never"
          textZoom={100}
          allowsInlineMediaPlayback
          setSupportMultipleWindows={false}
          startInLoadingState
          applicationNameForUserAgent="AsylumJudgeMobile/1.0.3"
          injectedJavaScriptBeforeContentLoaded={NATIVE_APP_SCRIPT}
          injectedJavaScript={NATIVE_APP_SCRIPT}
          onLoadStart={() => setFailed(false)}
          onLoadProgress={({ nativeEvent }) => setLoadProgress(nativeEvent.progress)}
          onLoadEnd={() => {
            setLoadProgress(1);
            webViewRef.current?.injectJavaScript(NATIVE_APP_SCRIPT);
          }}
          onNavigationStateChange={trackNavigation}
          onShouldStartLoadWithRequest={(request) => openUrl(request.url)}
          onError={() => setFailed(true)}
          onHttpError={({ nativeEvent }) => { if (nativeEvent.statusCode >= 400) setFailed(true); }}
          renderLoading={() => <View style={styles.loading} />}
        />

        {failed ? (
          <View style={styles.errorPanel} accessibilityRole="alert">
            <Text style={styles.errorTitle}>{t('asylumApp.errorTitle')}</Text>
            <Text style={styles.errorText}>{t('asylumApp.errorBody')}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('asylumApp.retryA11y')}
              onPress={retry}
              style={({ pressed }) => [styles.retryButton, pressed && styles.retryPressed]}
            >
              <Text style={styles.retryText}>{t('asylumApp.retry')}</Text>
            </Pressable>
          </View>
        ) : null}
        </>}
      </View>

      <View style={styles.tabBar} accessibilityRole="tablist">
        {TABS.map((tab) => {
          const selected = activeTab === tab.key;
          return (
            <Pressable
              key={tab.key}
              accessibilityRole="tab"
              accessibilityLabel={t(tab.labelKey)}
              accessibilityState={{ selected }}
              onPress={() => selectTab(tab)}
              style={({ pressed }) => [styles.tabItem, pressed && styles.tabPressed]}
            >
              <View style={[styles.tabIcon, selected && styles.tabIconActive]}>
                <Text style={[styles.tabIconText, selected && styles.tabIconTextActive]}>{tab.icon}</Text>
              </View>
              <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.82} style={[styles.tabLabel, selected && styles.tabLabelActive]}>{t(tab.labelKey)}</Text>
            </Pressable>
          );
        })}
      </View>
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AsylumJudgeApp />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#ffffff' },
  content: { flex: 1, backgroundColor: '#f4f8f5' },
  webView: { flex: 1, backgroundColor: '#f4f8f5' },
  progressTrack: { height: 2, backgroundColor: '#e7ece9' },
  progressBar: { height: 2, backgroundColor: '#14804a' },
  loading: { flex: 1, backgroundColor: '#f4f8f5' },
  errorPanel: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f5f7f6',
    padding: 28
  },
  errorTitle: { color: '#102019', fontSize: 21, fontWeight: '800' },
  errorText: { color: '#5f6f67', fontSize: 15, lineHeight: 23, marginTop: 10, textAlign: 'center' },
  retryButton: {
    minHeight: 48,
    minWidth: 144,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 24,
    backgroundColor: '#14804a',
    marginTop: 22,
    paddingHorizontal: 24
  },
  retryPressed: { opacity: 0.82 },
  retryText: { color: '#ffffff', fontSize: 16, fontWeight: '800' },
  tabBar: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'stretch',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#d4ddd7',
    backgroundColor: '#ffffff',
    paddingHorizontal: 3,
    paddingTop: 2
  },
  tabItem: { flex: 1, minHeight: 54, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 2, paddingVertical: 3 },
  tabPressed: { backgroundColor: '#f2f7f4' },
  tabIcon: { width: 27, height: 27, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  tabIconActive: { backgroundColor: '#e6f4eb' },
  tabIconText: { color: '#66736c', fontSize: 16, fontWeight: '900' },
  tabIconTextActive: { color: '#14804a' },
  tabLabel: { color: '#66736c', fontSize: 11.5, lineHeight: 15, fontWeight: '700', marginTop: 2, textAlign: 'center' },
  tabLabelActive: { color: '#14804a', fontWeight: '900' }
});
