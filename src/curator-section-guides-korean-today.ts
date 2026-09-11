import type { CuratorArticle } from './curator-content'

export const KOREAN_PANORAMA_2026_ARTICLE: CuratorArticle = {
  slug: 'korean-panorama-2026-all-6',
  category: '2026 섹션 가이드',
  title: '한국영화의 오늘 - 파노라마 6편 분석: 지금 한국영화가 붙드는 현실과 장르',
  deck: '입시 코미디부터 역사 멜로드라마, 법정·면접 미스터리와 SF까지 6편이 보여주는 동시대 한국영화의 폭을 읽어봅니다.',
  readingMinutes: 8,
  tags: ['한국영화의오늘','파노라마','전작 분석'],
  analysisOnly: true,
  lead: '파노라마 6편은 규모가 크지 않지만 장르의 폭은 넓습니다. 수능 출제 시스템을 코미디로 다룬 작품, 일제강점기의 기억을 여성의 우정으로 되짚는 작품, 검사와 강압수사의 책임을 파고드는 법정 드라마, 섬의 청춘 멜로드라마, 채용 면접을 구조적 미스터리로 바꾼 영화, 그리고 나홍진의 SF 스릴러까지 서로 다른 결을 보입니다. 공식 주제에서는 여성 4편, 사랑과 심리 스릴러가 각각 2편으로 나타납니다.',
  highlight: '올해 파노라마는 “한국영화다운 하나의 경향”보다, 현실의 제도와 관계를 장르적으로 얼마나 다르게 변주할 수 있는지를 보여주는 작은 샘플러에 가깝습니다.',
  sections: [
    {
      heading:'숫자로 보는 한국영화의 오늘 - 파노라마',
      paragraphs:[
        '공식 데이터 기준 6편이며 평균 러닝타임은 약 117분입니다. 가장 짧은 작품은 99분의 <수능, 출제의 비밀>, 가장 긴 작품은 156분의 <호프>입니다.',
        '6편 중 4편이 World Premiere이고, 공식 #작품검색에서 여성 주제가 4편으로 가장 많습니다.',
      ],
      stats:[
        {value:'6편',label:'전체 작품'},
        {value:'4편',label:'World Premiere'},
        {value:'약 117분',label:'평균 러닝타임'},
        {value:'4편',label:'여성 주제'},
      ],
    },
    {
      heading:'파노라마 6편 전작 미니 가이드',
      films:[
        {title:'수능, 출제의 비밀',englishTitle:'Ugly Duckling Ms. Maeng',meta:'이용재 · 99분 · World Premiere',description:'대한민국 수능 문제를 만드는 폐쇄적인 출제 캠프를 코미디의 무대로 삼습니다. 지방 교사 한 사람이 엘리트 교수 집단에 끼어들면서 교육 시스템의 권위와 서열을 웃음으로 해체합니다.',tags:['여성','코미디/유머/블랙코미디/풍자']},
        {title:'여전히 찬란하게',englishTitle:'Still Shining',meta:'송일곤 · 118분 · World Premiere',description:'일제강점기 17세였던 두 여성의 우정과 현재 노년의 시간을 교차하며 기억과 치유를 따라갑니다. 고통스러운 순간도 삶의 찬란한 기억이 될 수 있다는 감정을 역사와 멜로드라마로 엮습니다.',tags:['여성','역사/전쟁','사랑/연애/로맨스']},
        {title:'자필',englishTitle:'SINNER',meta:'홍성민 · 110분 · World Premiere',description:'장관 후보가 된 검사가 과거 강압수사 사건과 다시 마주합니다. 한 장의 편지와 사형 구형의 기억을 통해 검찰 권력, 죄책감, 뒤늦은 책임을 추적하는 법정·범죄 드라마입니다.',tags:['범죄/폭력','여성']},
        {title:'첫세계',englishTitle:'The World Before',meta:'윤단비 · 115분',description:'작은 섬에서 살아온 열일곱 소녀가 오랜 친구와 재회하며 자신의 조용한 세계에 처음 균열을 경험합니다. 섬의 일상과 청춘의 감정을 섬세하게 포착하는 성장 멜로드라마입니다.',tags:['성장영화/청춘','여성','사랑/연애/로맨스']},
        {title:'최종면접',englishTitle:'Final Interview',meta:'김정훈 · 106분 · World Premiere',description:'한 명만 뽑는 최종면접과 6년 뒤의 인터뷰를 교차하며 여섯 사람의 서로 다른 기억을 맞춥니다. 취업 경쟁을 배경으로 증언의 불확실성과 집단 심리를 파고드는 미스터리입니다.',tags:['심리/미스터리/서스펜스/스릴러']},
        {title:'호프',englishTitle:'HOPE',meta:'나홍진 · 156분',description:'마을과 숲, 도로를 가로지르는 추격의 방향을 끊임없이 뒤집으며 쫓는 자와 쫓기는 자의 경계를 흐립니다. 속도의 쾌감보다 방향 상실과 불안 자체를 키우는 대형 SF 스릴러입니다.',tags:['SF/판타지','심리/미스터리/서스펜스/스릴러']},
      ],
    },
  ],
}

export const KOREAN_SPECIAL_PREMIERE_2026_ARTICLE: CuratorArticle = {
  slug: 'korean-special-premiere-2026-all-3',
  category: '2026 섹션 가이드',
  title: '한국영화의 오늘 - 스페셜 프리미어 3편 분석: 익숙한 장르를 비트는 세 방식',
  deck: '미스터리 스릴러, 세대 가족 코미디, 형제와 소를 둘러싼 드라마까지 세 작품이 대중 장르를 어떻게 변주하는지 살펴봅니다.',
  readingMinutes: 6,
  tags: ['한국영화의오늘','스페셜프리미어','전작 분석'],
  analysisOnly: true,
  lead: '스페셜 프리미어는 3편 모두 월드 프리미어이며 러닝타임도 101~110분 사이로 비교적 고르게 분포합니다. 작품 수는 적지만 장르적 성격은 분명합니다. <사피엔스>는 진실과 기억을 퍼즐처럼 해체하고, <세대유감>은 종가의 전통과 세대 갈등을 대환장 가족 코미디로 바꾸며, <정가네>는 소와 목장을 사이에 둔 형제의 오래된 감정을 가족극으로 풀어냅니다.',
  highlight: '세 작품 모두 익숙한 대중 장르를 사용하지만, 핵심 갈등은 결국 “가족과 기억을 누구의 시선으로 다시 해석할 것인가”에 모입니다.',
  sections:[
    {
      heading:'숫자로 보는 스페셜 프리미어',
      paragraphs:[
        '공식 데이터 기준 3편 모두 World Premiere이며 평균 러닝타임은 약 104분입니다.',
        '가족/아동 주제가 2편에 포함되고, 나머지는 범죄·스릴러, 블랙코미디, 자연과 동물 등 서로 다른 장르적 소재를 사용합니다.',
      ],
      stats:[
        {value:'3편',label:'전체 작품'},
        {value:'3편',label:'World Premiere'},
        {value:'약 104분',label:'평균 러닝타임'},
        {value:'2편',label:'가족/아동 주제'},
      ],
    },
    {
      heading:'스페셜 프리미어 3편 전작 미니 가이드',
      films:[
        {title:'사피엔스',englishTitle:'Sapiens',meta:'이후빈 · 101분 · World Premiere',description:'재벌 3세 납치 사건과 기억이 불완전한 용의자를 중심으로 사실과 진실의 거리를 퍼즐처럼 흔듭니다. 하나의 몸에 여러 인격이 존재한다는 설정을 이용해 기억과 책임을 미스터리로 구성합니다.',tags:['범죄/폭력','심리/미스터리/서스펜스/스릴러']},
        {title:'세대유감',englishTitle:'The Sorry Generation',meta:'김성윤 · 102분 · World Premiere',description:'무형문화유산 심사를 앞둔 종가에서 장손과 다음 세대가 조상, 책임, 굿판과 퇴마를 둘러싸고 폭발합니다. 전통과 세대 갈등을 과장된 가족 코미디로 밀어붙이는 작품입니다.',tags:['가족/아동','코미디/유머/블랙코미디/풍자']},
        {title:'정가네',englishTitle:'Cattle Run',meta:'김지현 · 110분 · World Premiere',description:'30년째 말을 섞지 않는 형제가 각자 목장을 운영하다 소의 질병과 경쟁을 계기로 다시 충돌합니다. 혈연의 질긴 감정과 농촌의 삶, 동물과 인간의 생존을 가족극으로 묶습니다.',tags:['가족/아동','자연/환경/동식물','리메이크/원작있음']},
      ],
    },
  ],
}
