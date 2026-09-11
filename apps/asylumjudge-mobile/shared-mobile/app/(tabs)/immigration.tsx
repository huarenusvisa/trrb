import { WebPortalScreen } from '../../src/components/WebPortalScreen';

const JOBS_URL = 'https://huarengongzuo.com/';

export default function JobsTabScreen() {
  return <WebPortalScreen screenTestID="screen-immigration" webViewTestID="jobs-portal-webview" brand="华人工作网" url={JOBS_URL} allowedHosts={['huarengongzuo.com']} loadingText="正在打开华人工作网…" errorTitle="华人工作网暂时无法打开" errorBody="请检查网络后重试，或改用浏览器打开。" />;
}
