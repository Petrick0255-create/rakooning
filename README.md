# 라쿠닝

같은 이족보행 직장인 라쿤 캐릭터로 8초짜리 짧은 영상을 만드는 정적 웹앱입니다. Gemini API의 Veo 3.1 image-to-video 기능을 사용해 캐릭터 기준 이미지를 첫 프레임으로 전달합니다. 기본 모습은 주황 스카프만 두른 상태이며, 장면마다 출근복·후드·정장·사용자 지정 복장을 선택할 수 있습니다.

## 로컬에서 실행

ES 모듈과 API 요청 때문에 HTML 파일을 직접 열지 말고 로컬 서버로 실행하세요.

```bash
cd dist
python3 -m http.server 4173
```

그다음 `http://localhost:4173`을 엽니다.

## Gemini API 키

앱 우측 상단의 **API 설정**에서 키를 입력합니다. 키는 소스 코드나 저장소에 기록되지 않고 현재 브라우저의 `localStorage`에만 저장됩니다.

중요한 한계가 있습니다. GitHub Pages는 순수 정적 호스팅이라 API 키를 서버 비밀값처럼 완전히 숨길 수 없습니다. 키는 Google API 요청에 실리므로 브라우저 개발자 도구나 악성 확장 프로그램에서는 볼 수 있습니다. 개인용으로만 사용하고 다음 제한을 적용하세요.

- Google AI Studio 또는 Google Cloud에서 키를 Gemini API 전용으로 제한
- 가능하면 허용 웹사이트를 실제 GitHub Pages 주소로 제한
- 낮은 일일 사용량/결제 알림 설정
- 공용 기기에서 사용하지 않기
- 유출이 의심되면 즉시 키 폐기 및 재발급

공개 사용자에게 제공할 서비스로 확장할 때는 서버리스 함수나 백엔드 프록시로 API 키를 옮겨야 합니다.

## GitHub Pages 배포

1. 이 폴더를 GitHub 저장소의 루트로 푸시합니다.
2. 저장소의 **Settings → Pages → Build and deployment**에서 Source를 **GitHub Actions**로 선택합니다.
3. `main` 브랜치에 푸시하면 `.github/workflows/deploy-pages.yml`이 `dist` 폴더를 배포합니다.

API 키는 GitHub Secrets에 넣지 않아도 됩니다. 사용자가 배포된 웹페이지에서 직접 입력합니다.

## Typecast 음성

영상 생성 후 Typecast 대본, 목소리, 감정, 말하기 속도를 선택해 음성을 만들 수 있습니다. Typecast `ssfm-v30`으로 만든 WAV 음성을 브라우저에서 영상과 합치며, Veo 원본 음량은 8%로 낮추고 음성은 100%로 유지합니다. 합친 결과는 호환성을 위해 WebM 형식으로 저장됩니다.

Typecast 키 역시 **API 설정**에서 입력하며 현재 브라우저의 `localStorage`에만 저장됩니다. 정적 앱에서는 개발자 도구나 악성 확장 프로그램이 키를 볼 수 있으므로 개인용으로만 사용하고, 공개 서비스로 확장할 때는 Gemini 키와 함께 서버 측 프록시로 옮기세요.

## 현재 제약

- 참조 이미지를 사용하는 Veo 3.1 영상은 8초로 고정됩니다.
- 영상 생성은 보통 수십 초에서 수 분이 걸릴 수 있습니다.
- 8초보다 긴 Typecast 음성은 영상 끝에서 잘리므로 대본을 줄이거나 말하기 속도를 높여야 합니다.
- 영상·음성 합성은 `MediaRecorder`를 지원하는 최신 Chrome 또는 Edge에서 작동합니다.
- 생성 영상은 Google 서버에 제한된 기간만 보관되므로 완성 후 바로 저장하세요.
- Veo 모델과 API 형식은 Preview 단계에서 변경될 수 있습니다.

기준 이미지는 브라우저에서 선택한 영상 비율에 맞춰 JPEG 첫 프레임으로 변환한 뒤 Veo의 `bytesBase64Encoded` 형식으로 전송합니다. `referenceImages`를 거부하는 Gemini API 계정에서도 작동하도록 모든 Veo 3.1 모델이 지원하는 `image` 입력 방식을 사용합니다.
