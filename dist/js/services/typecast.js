/**
 * Typecast 연결용 경계입니다.
 * 나중에 API 사양을 확정하면 이 함수 내부만 구현하고 app.js에서 호출하세요.
 * 정적 앱에서는 키가 브라우저에 노출될 수 있으므로, 공개 서비스로 키울 때는
 * GitHub Pages가 아닌 작은 서버리스 프록시를 두는 편이 안전합니다.
 */
export async function synthesizeVoice() {
  throw new Error("Typecast 음성 합성은 아직 연결되지 않았어요.");
}
