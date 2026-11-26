# Dear My (?)

자주 쓰거나 곁에 두는 물건과 그 이야기를 모으는 온라인 참여 아카이브. 빌드 과정 없이 GitHub Pages에서 실행할 수 있습니다.

## GitHub Pages에 올리기

1. ZIP을 풀고 GitHub에 저장소를 만듭니다.
2. `dear-my-archive` 폴더 **안의 파일과 폴더**를 저장소의 최상위에 올립니다. `index.html`이 최상위에 있어야 합니다. 숨김 파일 `.nojekyll`도 함께 올립니다.
3. 저장소의 **Settings → Pages → Build and deployment**에서 **Deploy from a branch**를 선택하고 **main / (root)**를 저장합니다.
4. Pages 배포가 완료되면 같은 화면에 표시되는 주소에서 확인합니다.

[GitHub Pages 게시 설정 안내](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)

## 기록 저장 설정

기본 설정은 **시연 모드**입니다. 예시 물건 여섯 개가 들어 있고, 직접 등록한 기록은 현재 브라우저에 저장됩니다.

참가자가 올린 기록을 여러 기기에서 함께 보려면 다음을 설정합니다.

1. Supabase 프로젝트를 만들고 **SQL Editor**에서 `supabase/setup.sql`의 내용을 실행합니다.
2. `config.js`의 `supabaseUrl`과 `publishableKey`에 프로젝트 URL과 **Publishable key**(`sb_publishable_…`)를 입력하고 GitHub에 올립니다. 비밀 키나 service role 키는 사용하지 마세요.
3. 실제 행사에서 예시 기록을 숨기고 싶으면 같은 파일의 `showExamples`를 `false`로 바꿉니다.
4. 휴대폰에서 테스트 사진과 글을 등록하고, 다른 기기에서 사이트를 다시 열어 같은 기록이 보이는지 확인합니다.

공동 아카이브는 공개 열람과 로그인 없는 제출을 허용합니다. `supabase/story-actions.sql`을 실행하면, 이후 올린 글은 작성에 사용한 브라우저에서 이야기 창을 열어 수정하거나 삭제할 수 있습니다. 관리 정보가 없는 기존 글은 Supabase Table Editor에서 관리자가 관리합니다. 프로토타입은 제출 속도 제한과 사전 심사를 제공하지 않습니다. 시연 모드에서 저장한 기록은 공동 아카이브로 자동 이전되지 않습니다.

[Supabase 키 안내](https://supabase.com/docs/guides/getting-started/api-keys)

## 시연 순서

1. 화면에 떠다니는 초록 단추로 사진을 올리고 배경 제거 결과를 확인합니다.
2. 이름, 함께한 시간, 이야기를 적고 **등록하기**를 누릅니다. 새 기록은 첫 페이지 맨 위에 나타납니다.
3. 글 사이에 들어간 물건 사진을 누르면 이야기와 사진을 자세히 볼 수 있습니다.
4. 기록은 페이지마다 최대 10개씩 표시됩니다. 기록 아래에서 이전·다음 페이지로 이동할 수 있습니다.

### 사진 배경 제거

이미 처리된 투명 이미지와 피사체 대비가 뚜렷한 단색 배경은 브라우저에서 직접 처리합니다. 복잡한 배경은 인터넷에서 IMG.LY 모델과 실행 파일을 불러와 브라우저에서 처리합니다. 모델을 받는 첫 실행은 더 오래 걸릴 수 있습니다. 업로드 전에 결과를 확인하고, 제거가 어려운 사진은 단색 배경에서 다시 찍어보세요.

[IMG.LY background-removal-js 1.7.0 — 소스 및 AGPL 라이선스](https://github.com/imgly/background-removal-js)  
예시 사진은 생성 이미지이며, 사이트 안에서 예시 기록으로 표시됩니다.

## 로컬에서 열기

Python 3가 있을 때 프로젝트 디렉터리에서 `python3 -m http.server 8000 --bind 127.0.0.1`을 실행하고 **http://127.0.0.1:8000/**에 접속합니다.
