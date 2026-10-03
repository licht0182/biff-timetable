# 내 시간표 목록 카드 테두리 중복 수정

작성일: 2026-10-03 (KST)

## 사진과 일치하는 재현

‘그날의 태주’(267), ‘바이올리니스트’(325)와 사용자 일정 3개를 넣어 iPhone 크기의 WebKit 화면에서 재현했다. 일반 영화 카드와 같은 크기의 바깥 컨테이너에도 유리 효과가 적용되어, 안쪽 카드의 모서리 반경 10px와 바깥 반경 20px의 테두리가 겹쳤다. 바깥과 안쪽에 각각 직접 유리 강조 레이어가 1개씩 있었다. 사용자 일정에는 이 컨테이너가 없어 사진처럼 영화 카드만 이중 테두리가 나타났다.

이전의 긴 제목·장소 겹침 수정에서는 이번 테두리 중복을 놓쳤다.

## 수정

- 일반 영화의 구조용 컨테이너를 `schedule-screening-stack`으로 변경해 유리 효과 대상에서 제외했다.
- 실제 카드의 테두리와 기존 모서리 모양, 왼쪽 정렬을 유지했다.
- 일정 충돌 그룹은 기존 컨테이너와 제목, 안쪽 카드 구성을 유지했다.
- 버튼의 알약 모양과 색상만 바뀌는 누름 효과를 유지했다.

변경 파일: `src/components/ScheduleList.tsx`, `src/schedule-list.css`, `tests/e2e/schedule-list.spec.ts`.

## 검증

- TypeScript 검사 및 Vite 빌드 완료. 빌드 CSS: `index-D-RcMF69.css`.
- 목록·읽기 쉬움·버튼·유리 효과 관련 실제 브라우저 검사 **64개 통과, 실패 0, flaky 0**.
- 새 검사 6개: Chrome/WebKit × 320·393·1440px. 구조용 컨테이너의 강조 레이어 0, 투명 배경, 테두리 0, 그림자 없음과 카드 상세 열기를 확인했다.
- 사진에 나온 영화 267·325를 넣어 Chrome/WebKit × 320·393·768·1440px 실화면 확인. 모든 화면에서 바깥 강조 레이어 0, 카드 강조 레이어 1, 사용자 일정과 같은 카드 모서리 반경, 페이지 가로 넘침 0px.
- 393px 다크 모드 화면도 확인했다. 기존 일정 충돌 및 대안 액션 검사는 통과했다.
- 독립 읽기 전용 검토 결과 `ship`: 검증 식별자 일치, 선택자와 React 컨테이너 교체 동작, 검사 결과와 실화면 확인 후 차단 사항 없음.
- 사용자 지침에 따라 PWA는 별도로 검사하지 않았다.

### 화면 증거

- [수정 전 WebKit 393px](playwright/card-rim-before-webkit-393.png)
- [수정 후 WebKit 393px](playwright/card-rim-after-webkit-393.png)
- [수정 후 Chrome 393px](playwright/card-rim-after-chrome-393.png)
- 로컬 추가 화면: `output/playwright/card-rim-after-{chrome,webkit}-{320,768,1440}.png`, `card-rim-after-{chrome,webkit}-393-dark.png`.

후보 검증 식별자: `3fc44e603341de7efbbd68eb8f2ee514fdf8b68a27f6a1adce1bcca904e31568` (기준 HEAD와 src/tests diff의 SHA-256).

커밋 후 전체 CI와 공개 사이트의 같은 수정본 확인이 최종 배포 완료 조건이다. 최종 결과는 `output/card-rim-deployment-2026-10-03.md`에 기록한다.
