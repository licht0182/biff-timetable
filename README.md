# BIFF Timetable

부산국제영화제 상영작을 검색하고 원하는 회차를 선택해 개인 시간표를 만드는 정적 웹앱입니다. GitHub Pages만으로 동작하며 별도 백엔드 서버가 필요하지 않습니다.

## 현재 기능

- 영화 제목, 영문 제목, 감독, 국가 검색
- 섹션 / 날짜 / 상영관 / GV 필터
- 관심작(★) 저장 및 관심작만 보기
- 영화별 전체 상영 회차 표시
- 작품 상세 보기(데이터에 감독·국가·러닝타임·시놉시스 등이 있으면 자동 표시)
- 원하는 회차 추가/삭제
- 같은 날짜의 상영시간 충돌 경고
- 상영관 이동 여유 경고
  - 같은 상영관군: 기본 10분
  - 서로 다른 상영관군: 기본 30분
- 에브리타임 스타일 날짜 × 시간 시간표
- 브라우저 크기에 맞춘 시간표 자동 축소
- 회차별 `예매 예정 / 예매 완료` 상태 관리
- 선택 회차 / 관심작 / 예매 상태를 LocalStorage에 자동 저장
- JSON 백업 및 가져오기
- 선택한 시간표를 `.ics` 캘린더 파일로 내보내기
- 영화 공식 정보 링크
- 상영 데이터 구조 자동 검증
- GitHub Pages 자동 빌드 및 배포

## 데이터 교체

웹앱은 `public/screenings.json`을 읽습니다. 현재 2026 상영시간표 공개 전에는 BIFF 2025 공식 시간표 기반 테스트 데이터가 들어 있습니다.

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
  "synopsis": "작품 소개",
  "language": "Korean",
  "year": 2026,
  "url": "https://www.biff.kr/...",
  "screenings": [
    {
      "id": "film-001-s1",
      "code": "101",
      "date": "2026-10-07",
      "start": "13:00",
      "end": "15:00",
      "venue": "영화의전당 중극장",
      "gv": true
    }
  ]
}
```

`director`, `country`, `runtime`, `synopsis`, `language`, `year`, `url`, `end`, `gv`, `code`는 선택 필드입니다. 기존의 최소 데이터 형식도 그대로 동작합니다.

## 데이터 검증

2026 데이터로 교체하기 전에 다음 명령으로 형식을 확인할 수 있습니다.

```bash
npm run validate:data
```

GitHub Pages 배포 워크플로도 빌드 전에 이 검증을 자동 실행합니다. 잘못된 날짜/시간 형식, 중복 ID, 필수 값 누락이 있으면 배포를 중단하여 기존 정상 사이트가 잘못된 데이터로 교체되는 것을 막습니다.

## 로컬 실행

```bash
npm install
npm run dev
```

## 빌드

```bash
npm run validate:data
npm run build
```

## GitHub Pages

`.github/workflows/deploy-pages.yml`이 `main` 브랜치 변경 시 데이터 검증 → 빌드 → 배포 순으로 실행됩니다.

GitHub 저장소의 **Settings → Pages → Build and deployment → Source**에서 **GitHub Actions**를 선택해야 합니다.

Vite의 배포 경로는 저장소 이름에 맞춰 `/biff-timetable/`로 설정되어 있습니다.

## 저장 방식

사용자 데이터는 서버가 아니라 브라우저 LocalStorage에 저장됩니다.

- 선택 회차: 기존 `biff-timetable:selected-screenings:v1` 키를 그대로 사용하므로 이전 선택 내용이 유지됩니다.
- 관심작과 예매 상태는 별도 LocalStorage 키에 저장됩니다.
- 다른 기기와 자동 동기화되지는 않지만 JSON 백업/가져오기로 이동할 수 있습니다.
- `.ics` 내보내기를 이용하면 선택한 회차를 캘린더 앱에 추가할 수 있습니다.

## 2026 데이터 전환

2026 BIFF 공식 상영시간표가 공개되면 `public/screenings.json`만 같은 스키마의 2026 데이터로 교체하면 현재 검색, 필터, 상세보기, 시간표, 예매 상태, 내보내기 기능을 그대로 사용할 수 있습니다. 데이터 교체 시 2025 테스트 데이터는 제거하는 것을 전제로 합니다.
