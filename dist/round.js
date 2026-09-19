(function(root){
  'use strict';
  // Round 1 closed sales on 2002-12-07 20:00 KST; one round per week since.
  const FIRST_CLOSE=Date.UTC(2002,11,7,11,0),WEEK=7*86400000;
  // The round still on sale at `now` (ms since epoch).
  function upcoming(now){
    if(!Number.isFinite(now))throw new Error('현재 시각을 확인할 수 없습니다.');
    return Math.max(1,Math.floor((now-FIRST_CLOSE)/WEEK)+2);
  }
  const api={upcoming};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  root.LottoRound=api;
})(typeof window!=='undefined'?window:globalThis);
