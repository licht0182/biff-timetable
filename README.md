# BIFF Timetable

부산국제영화제 상영작을 검색하고 원하는 회차를 선택해 개인 시간표를 만드는 정적 웹앱입니다.

## 현재 기능

- 영화 제목, 감독, 국가 검색
- 섹션 필터
- 영화별 상영 회차 표시
- 원하는 회차 추가/삭제
- 같은 날짜의 상영시간 충돌 경고
- 에브리타임 스타일 날짜 × 시간 시간표
- 선택한 회차를 LocalStorage에 자동 저장
- 영화 공식 정보 링크
- GitHub Pages 자동 배포 워크플로

## 데이터 교체

웹앱은 `public/screenings.json`을 읽습니다. 현재는 UI 테스트용 샘플 데이터가 들어 있습니다.

각 영화는 다음 형태를 사용합니다.

```json
{
  "id": "film-001",
  "title": "영화 제목",
  "englishTitle": "English Title",
  "director": "감독",
  "country": "대한민국",
  "section": "뉴 커런츠",
  "runtime": 120,
  "url": "https://www.biff.kr/...",
  "screenings": [
    {
      "id": "film-001-s1",
      "date": "2026-09-18",
      "start": "13:00",
      "end": "15:00",
      "venue": "영화의전당 중극장",
      "gv": true
    }
  ]
}
```

실제 2026 BIFF 데이터가 준비되면 이 파일만 같은 구조로 교체하면 됩니다.

## 로컬 실행

```bash
npm install
npm run dev
```

## 빌드

```bash
npm run build
```

## GitHub Pages

`.github/workflows/deploy-pages.yml`이 `main` 브랜치 변경 시 자동으로 빌드 및 배포합니다.

GitHub 저장소의 **Settings → Pages → Build and deployment → Source**에서 **GitHub Actions**를 선택해야 합니다.

Vite의 배포 경로는 저장소 이름에 맞춰 `/biff-timetable/`로 설정되어 있습니다.

## 저장 방식

개인 시간표는 서버가 아니라 사용자의 브라우저 LocalStorage에 저장됩니다. 따라서 같은 기기의 같은 브라우저에서는 다시 접속해도 유지되지만, 다른 기기와 자동 동기화되지는 않습니다.
