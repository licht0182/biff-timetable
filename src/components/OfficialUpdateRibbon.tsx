const OFFICIAL_UPDATE_URL = 'https://www.biff.kr/kor/artyboard/mboard.asp?Action=view&intSeq=102705&strBoardID=9611_03'

export default function OfficialUpdateRibbon() {
  return (
    <aside className="official-update-ribbon" aria-label="BIFF 공식 상영·행사 변경 안내">
      <span className="official-update-ribbon-label">BIFF 공식 공지</span>
      <p>추가 상영·GV·프로그램 행사 변경사항을 확인하세요.</p>
      <a href={OFFICIAL_UPDATE_URL} target="_blank" rel="noopener noreferrer">
        변경 안내 보기 <span aria-hidden="true">↗</span><span className="visually-hidden">(새 창)</span>
      </a>
    </aside>
  )
}
