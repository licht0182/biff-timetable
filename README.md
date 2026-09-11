# BIFF Timetable

부산국제영화제 상영작을 검색하고 원하는 회차를 선택해 개인 시간표를 만드는 정적 웹앱입니다. GitHub Pages만으로 동작하며 별도 백엔드 서버가 필요하지 않습니다.

## 현재 기능

- 영화 제목, 영문 제목, 감독, 국가, 장르 검색
- 섹션 / 날짜 / 상영관 / GV 필터
- 관심작(★) 저장 및 관심작만 보기
- 영화별 전체 상영 회차 표시
- 작품 상세 보기(데이터에 감독·국가·장르·러닝타임·시놉시스 등이 있으면 자동 표시)
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

웹앱은 `public/screenings.json`을 읽습니다. 현재 데이터는 BIFF 공식 2026 날짜별 상영시간표와 공식 2026 작품정보를 결합한 데이터이며, 2025 테스트 데이터는 포함하지 않습니다. 묶음상영은 한 장의 티켓과 하나의 시간표 블록으로 다룰 수 있도록 하나의 프로그램 항목으로 저장합니다.

각 영화는 다음 형태를 사용합니다.

```json
{
  "id": "film-001",
  "title": "영화 제목",
  "englishTitle": "English Title",
  "director": "감독",
  "country": "대한민국",
  "genre": "드라마 · 성장영화/청춘",
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

`director`, `country`, `genre`, `runtime`, `synopsis`, `language`, `year`, `url`, `end`, `gv`, `code`는 선택 필드입니다. 기존의 최소 데이터 형식도 그대로 동작합니다.

## 장르 수집

각 영화에 BIFF 공식 작품정보 URL이 들어 있으면 공식 페이지에서 장르를 읽어 `genre` 필드를 갱신할 수 있습니다.

```bash
npm run enrich:genres
```

수집기는 현재 BIFF 공식 프로그램 페이지(`program/prog_view.asp`)와 역대 아카이브 작품 페이지(`archive/arc_history_view.asp`)를 지원합니다. 공식 페이지에 장르 항목이 없는 작품은 추정하지 않고 기존 값을 유지하거나 공란으로 둡니다.

## 데이터 검증

상영 데이터 형식은 다음 명령으로 확인할 수 있습니다.

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

## 2026 공식 상영시간표 갱신

2026 BIFF 공식 상영시간표를 다시 수집해야 할 때는 `scripts/scrape-biff-screenings.py`를 사용합니다. 수집기는 공식 날짜별 시간표의 2026-10-06~2026-10-15 편성을 읽고, `public/films-2026.json`의 공식 작품정보와 결합해 `public/screenings.json`을 생성합니다. 공식 개막·폐막 회차와 행사, 묶음상영도 현재 앱 스키마와 호환되는 단일 시간표 항목으로 변환하며, 필수 교차검증에 실패하면 파일 생성을 중단합니다.

```bash
python -m pip install -r scripts/requirements-biff-scrape.txt
python scripts/scrape-biff-screenings.py
npm run validate:data
```

현재 검색, 필터, 상세보기, 시간표, 예매 상태, 커스텀 일정, 내보내기와 기존 LocalStorage 키는 2026 데이터 전환 후에도 같은 구조를 사용합니다.
