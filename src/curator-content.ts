import { COMPETITION_2026_ARTICLE } from './curator-section-content'
import { ICONS_2026_ARTICLE } from './curator-section-guide-icons'
import { VISION_KOREA_2026_ARTICLE, VISION_ASIA_2026_ARTICLE } from './curator-section-guides-vision'
import { ASIAN_WINDOW_2026_ARTICLE } from './curator-section-guide-asian-window'
import { WORLD_CINEMA_2026_ARTICLE, FLASH_FORWARD_2026_ARTICLE } from './curator-section-guides-world'
import { KOREAN_PANORAMA_2026_ARTICLE, KOREAN_SPECIAL_PREMIERE_2026_ARTICLE } from './curator-section-guides-korean-today'
import { WIDE_ANGLE_2026_ARTICLE } from './curator-section-guide-wide-angle'
import { GALA_2026_ARTICLE, OPEN_CINEMA_2026_ARTICLE, MIDNIGHT_PASSION_2026_ARTICLE } from './curator-section-guides-gala-open-midnight'
import { ON_SCREEN_2026_ARTICLE, SPECIAL_PROGRAM_2026_ARTICLE, SPECIAL_SCREENING_2026_ARTICLE, OPENING_FILM_2026_ARTICLE } from './curator-section-guides-final'
import { STAY_OCT_10_11_2026_ARTICLE, STAY_OCT_10_12_2026_ARTICLE, STAY_OCT_09_11_2026_ARTICLE, STAY_OCT_09_12_2026_ARTICLE } from './curator-stay-guides'
import { LEE_CHANG_DONG_2026_ARTICLE, HAMAGUCHI_RYUSUKE_2026_ARTICLE } from './curator-director-guides'
import { CRISTIAN_MUNGIU_2026_ARTICLE } from './curator-director-guide-mungiu'
import { ANDREY_ZVYAGINTSEV_2026_ARTICLE } from './curator-director-guide-zvyagintsev'
import { PAWEL_PAWLIKOWSKI_2026_ARTICLE } from './curator-director-guide-pawlikowski'
import { NA_HONG_JIN_2026_ARTICLE } from './curator-director-guide-na-hong-jin'
import { KOREEDA_HIROKAZU_2026_ARTICLE } from './curator-director-guide-koreeda'

export type CuratorStat = {
  value: string
  label: string
}

export type CuratorFilmGuide = {
  title: string
  englishTitle?: string
  meta?: string
  description: string
  tags?: string[]
}

export type CuratorSection = {
  heading: string
  paragraphs?: string[]
  bullets?: string[]
  stats?: CuratorStat[]
  films?: CuratorFilmGuide[]
}

export type CuratorArticle = {
  slug: string
  category: string
  title: string
  deck: string
  readingMinutes: number
  tags: string[]
  analysisOnly?: boolean
  lead: string
  highlight?: string
  sections: CuratorSection[]
}

export const CURATOR_ARTICLES: CuratorArticle[] = [
  LEE_CHANG_DONG_2026_ARTICLE,
  HAMAGUCHI_RYUSUKE_2026_ARTICLE,
  CRISTIAN_MUNGIU_2026_ARTICLE,
  ANDREY_ZVYAGINTSEV_2026_ARTICLE,
  PAWEL_PAWLIKOWSKI_2026_ARTICLE,
  NA_HONG_JIN_2026_ARTICLE,
  KOREEDA_HIROKAZU_2026_ARTICLE,
  STAY_OCT_10_11_2026_ARTICLE,
  STAY_OCT_10_12_2026_ARTICLE,
  STAY_OCT_09_11_2026_ARTICLE,
  STAY_OCT_09_12_2026_ARTICLE,
  COMPETITION_2026_ARTICLE,
  ICONS_2026_ARTICLE,
  VISION_KOREA_2026_ARTICLE,
  VISION_ASIA_2026_ARTICLE,
  ASIAN_WINDOW_2026_ARTICLE,
  WORLD_CINEMA_2026_ARTICLE,
  FLASH_FORWARD_2026_ARTICLE,
  KOREAN_PANORAMA_2026_ARTICLE,
  KOREAN_SPECIAL_PREMIERE_2026_ARTICLE,
  WIDE_ANGLE_2026_ARTICLE,
  GALA_2026_ARTICLE,
  OPEN_CINEMA_2026_ARTICLE,
  MIDNIGHT_PASSION_2026_ARTICLE,
  ON_SCREEN_2026_ARTICLE,
  SPECIAL_PROGRAM_2026_ARTICLE,
  SPECIAL_SCREENING_2026_ARTICLE,
  OPENING_FILM_2026_ARTICLE,
  {
    slug: 'before-you-pick-three-rules',
    category: '선택 전략',
    title: '2026 BIFF, 작품을 고르기 전에 먼저 정할 세 가지',
    deck: '제목과 유명세보다 먼저 “이번 영화제에서 무엇을 얻고 싶은가”를 정하면 선택지가 빠르게 정리됩니다.',
    readingMinutes: 5,
    tags: ['입문', '우선순위', '시간표'],
    lead: '영화제에서 가장 어려운 일은 좋은 영화를 찾는 것이 아니라, 좋은 영화가 너무 많을 때 무엇을 포기할지 정하는 일입니다. AI 도슨트는 작품의 절대적인 점수보다 관객의 제한된 시간 안에서 선택의 가치가 어떻게 달라지는지를 먼저 봅니다.',
    highlight: '“좋은 영화인가?”와 “이번 BIFF에서 내가 우선 볼 영화인가?”는 서로 다른 질문입니다.',
    sections: [
      {
        heading: '1. 영화보다 먼저 경험의 우선순위를 정합니다',
        paragraphs: [
          '감독이나 배우와의 대화를 중시하는지, 새로운 국가와 신인 감독을 발견하고 싶은지, 화제작을 극장에서 먼저 보고 싶은지에 따라 같은 작품의 우선순위가 달라집니다.',
          '관심 기준을 두세 개만 먼저 정해두면 작품 설명을 읽을 때 판단이 빨라지고, 단순한 유명세에 끌려 시간표 전체가 흔들리는 일을 줄일 수 있습니다.',
        ],
        bullets: [
          '발견형: 낯선 감독·국가·장르를 적극적으로 선택',
          '대화형: GV와 게스트 참석 가능성이 있는 회차를 우선',
          '완성도형: 경력 있는 감독, 주요 섹션, 평단 반응을 함께 검토',
          '희소성형: 다른 경로로 다시 보기 어려운 작품과 회차를 우선',
        ],
      },
      {
        heading: '2. 작품뿐 아니라 “회차의 희소성”을 봅니다',
        paragraphs: [
          '같은 작품이라도 여러 번 상영되는 작품과 선택 가능한 회차가 적은 작품의 시간표 가치는 다릅니다. 먼저 희소한 회차를 고정하고, 대체 가능한 작품을 빈 시간에 배치하면 전체 만족도가 높아질 가능성이 큽니다.',
          '특히 GV, 늦은 시간대, 특정 상영관에만 있는 회차는 작품 자체의 매력과 별개로 일정상의 희소성이 생깁니다.',
        ],
      },
      {
        heading: '3. 상영시간 사이의 빈칸도 일정의 일부로 계산합니다',
        paragraphs: [
          '영화 두 편 사이에 20분이 비어 있어도 상영관 이동, 퇴장, 입장 대기, 식사까지 고려하면 실제로는 여유가 없을 수 있습니다. 하루 편수를 늘리는 것보다 핵심 작품을 놓치지 않는 시간표가 더 강합니다.',
          'BIFF Timetable의 이동시간 경고와 겹침 경고는 이런 숨은 비용을 확인하기 위한 도구입니다. 큐레이터 글에서 후보작을 정한 뒤 실제 회차를 시간표에 넣어 검증하는 흐름을 권합니다.',
        ],
      },
    ],
  },
  {
    slug: 'when-gv-is-worth-it',
    category: '관람 경험',
    title: 'GV 회차는 무조건 우선일까? 작품과 대화 사이의 선택법',
    deck: 'GV는 강력한 경험이지만 언제나 최선의 회차는 아닙니다. 일정 비용까지 포함해 판단하는 기준을 정리했습니다.',
    readingMinutes: 4,
    tags: ['GV', '회차 선택', '관람 경험'],
    lead: '감독이나 배우가 직접 참여하는 GV는 영화제의 가장 큰 장점 중 하나입니다. 다만 모든 작품을 GV 회차로 보려 하면 이동과 대기 때문에 다른 중요한 작품을 포기하게 될 수 있습니다.',
    highlight: 'GV의 가치는 “게스트가 온다”는 사실보다, 그 대화가 작품을 얼마나 확장할 수 있는지에 달려 있습니다.',
    sections: [
      {
        heading: 'GV 우선순위가 높은 경우',
        bullets: [
          '영화의 형식이나 제작 과정 자체가 중요한 작품',
          '감독의 전작이나 창작 세계를 이미 알고 있어 더 깊은 질문이 생기는 작품',
          '사회·역사적 맥락이 중요해 현장 설명이 관람을 확장할 가능성이 큰 작품',
          '향후 국내에서 다시 만나기 어려운 창작자의 방문 회차',
        ],
      },
      {
        heading: '일반 회차가 더 나을 수 있는 경우',
        paragraphs: [
          'GV 때문에 앞뒤 작품을 과도하게 포기해야 하거나, 이동시간이 빠듯해 입장 자체가 불안정하다면 일반 회차가 더 합리적일 수 있습니다.',
          '또한 작품에 완전히 몰입한 뒤 혼자 정리하는 경험을 선호한다면, 대화 프로그램이 반드시 만족도를 높이는 것은 아닙니다.',
        ],
      },
      {
        heading: '시간표에서는 GV 종료 이후까지 생각합니다',
        paragraphs: [
          'GV가 있는 회차는 영화 본편의 러닝타임만으로 다음 일정을 계산하면 위험합니다. 다음 상영관으로 이동해야 한다면 대화 종료 시점과 퇴장 시간을 포함해 충분한 여유를 두는 편이 좋습니다.',
        ],
      },
    ],
  },
  {
    slug: 'three-films-can-be-better-than-four',
    category: '시간표 설계',
    title: '하루 네 편보다 좋은 세 편이 있을 수 있는 이유',
    deck: '관람 편수를 최대화하는 시간표와 영화제 만족도를 최대화하는 시간표는 같지 않을 수 있습니다.',
    readingMinutes: 4,
    tags: ['동선', '체력', '일정 설계'],
    lead: '영화제 시간표를 짤 때 빈 시간이 보이면 한 편을 더 넣고 싶어집니다. 하지만 연속 관람이 길어질수록 작품을 받아들이는 집중력과 다음 상영에 대한 안정성이 함께 떨어질 수 있습니다.',
    highlight: '시간표의 빈칸은 실패한 시간이 아니라, 다음 작품의 집중력을 확보하는 완충 구간일 수 있습니다.',
    sections: [
      {
        heading: '편수보다 “핵심작 성공률”을 봅니다',
        paragraphs: [
          '하루의 최우선 작품 두세 편을 먼저 고정한 뒤 나머지를 채우는 방식이 안정적입니다. 모든 시간을 채우는 것보다 반드시 보고 싶은 작품에 늦지 않고 좋은 컨디션으로 들어가는 것이 중요합니다.',
        ],
      },
      {
        heading: '연속 관람의 비용은 뒤로 갈수록 커집니다',
        paragraphs: [
          '식사, 이동, 화장실, 티켓 확인 같은 짧은 활동이 누적되면 계획보다 일정이 쉽게 밀립니다. 특히 서로 다른 시설을 오갈 때는 지도상 이동시간만으로 판단하기 어렵습니다.',
        ],
        bullets: [
          '핵심작 앞에는 가능한 한 완충 시간을 확보',
          '다른 시설로 이동하는 연속 회차는 보수적으로 계산',
          '심야 회차 다음 날 첫 상영은 체력까지 포함해 판단',
          '빈 시간에는 관심작 후보를 즉흥적으로 추가할 여지를 남김',
        ],
      },
      {
        heading: '좋은 시간표는 수정하기 쉽습니다',
        paragraphs: [
          '예매 실패나 일정 변경은 영화제에서 흔한 변수입니다. 대체 가능한 후보작을 관심작으로 남겨두고, 한 회차가 무너지더라도 하루 전체가 무너지지 않는 구조를 만들면 대응이 쉬워집니다.',
        ],
      },
    ],
  },
]
