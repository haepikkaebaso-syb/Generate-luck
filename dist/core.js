(function (root) {
  'use strict';
  const TOTAL = 8145060;
  const sum = values => values.reduce((a, b) => a + b, 0);
  const key = values => [...values].sort((a, b) => a - b).join('-');
  function validNumbers(values, length) {
    return Array.isArray(values) && (length === undefined || values.length === length) &&
      Array.from(values).every(n => Number.isInteger(n) && n >= 1 && n <= 45) && new Set(values).size === values.length;
  }
  function randomInt(bound, source) {
    if (!Number.isInteger(bound) || bound < 1 || bound > 4294967296) throw new Error('잘못된 난수 범위입니다.');
    const limit = Math.floor(4294967296 / bound) * bound;
    const buffer = new Uint32Array(1);
    let value;
    do {
      if (source) value = source();
      else {
        if (!globalThis.crypto?.getRandomValues) throw new Error('이 브라우저에서는 안전한 난수를 사용할 수 없습니다. 최신 Edge 또는 Chrome에서 열어 주세요.');
        globalThis.crypto.getRandomValues(buffer);
        value = buffer[0];
      }
      if (!Number.isInteger(value) || value < 0 || value > 4294967295) throw new Error('난수 값이 올바르지 않습니다.');
    } while (value >= limit);
    return value % bound;
  }
  function createSpace(options = {}) {
    const fixed = [...(options.fixed || [])].sort((a,b) => a-b);
    const excluded = [...(options.excluded || [])];
    if (!validNumbers(fixed) || !validNumbers(excluded)) throw new Error('번호는 중복 없이 1~45 사이 정수로 선택해 주세요.');
    if (fixed.length > 6) throw new Error('고정 번호는 최대 6개까지 선택할 수 있습니다.');
    if (fixed.some(n => excluded.includes(n))) throw new Error('고정 번호와 제외 번호가 겹칩니다.');
    const pool = Array.from({length:45}, (_,i) => i+1).filter(n => !fixed.includes(n) && !excluded.includes(n));
    const needed = 6-fixed.length;
    const minSum = options.minSum ?? 21, maxSum = options.maxSum ?? 255;
    const minOdd = options.minOdd ?? 0, maxOdd = options.maxOdd ?? 6;
    if (![minSum,maxSum,minOdd,maxOdd].every(Number.isInteger) || minSum < 21 || maxSum > 255 || minSum > maxSum || minOdd < 0 || maxOdd > 6 || minOdd > maxOdd) throw new Error('합계 또는 홀수 개수 조건을 확인해 주세요.');
    const fixedSum = sum(fixed), fixedOdd = fixed.filter(n => n%2).length;
    const memo = new Map();
    function count(start, left, subtotal, odd) {
      if (left === 0) return subtotal >= minSum && subtotal <= maxSum && odd >= minOdd && odd <= maxOdd ? 1 : 0;
      if (pool.length-start < left || subtotal > maxSum || odd > maxOdd || odd+left < minOdd) return 0;
      let low = subtotal, high = subtotal;
      for (let j=0;j<left;j++) { low += pool[start+j]; high += pool[pool.length-1-j]; }
      if (low > maxSum || high < minSum) return 0;
      const memoKey = `${start}/${left}/${subtotal}/${odd}`;
      if (memo.has(memoKey)) return memo.get(memoKey);
      let total = 0;
      for (let i=start;i<=pool.length-left;i++) total += count(i+1,left-1,subtotal+pool[i],odd+pool[i]%2);
      memo.set(memoKey,total);
      return total;
    }
    const total = count(0,needed,fixedSum,fixedOdd);
    function unrank(rank) {
      if (!Number.isInteger(rank) || rank < 0 || rank >= total) throw new Error('조합 인덱스가 범위를 벗어났습니다.');
      const picked = [...fixed];
      let start=0,left=needed,subtotal=fixedSum,odd=fixedOdd;
      while (left) {
        for (let i=start;i<=pool.length-left;i++) {
          const block = count(i+1,left-1,subtotal+pool[i],odd+pool[i]%2);
          if (rank < block) { picked.push(pool[i]); start=i+1; left--; subtotal+=pool[i]; odd+=pool[i]%2; break; }
          rank -= block;
        }
      }
      return picked.sort((a,b) => a-b);
    }
    function rankOf(numbers) {
      if (!validNumbers(numbers,6) || fixed.some(n => !numbers.includes(n)) || excluded.some(n => numbers.includes(n))) return -1;
      const totalSum = sum(numbers), oddCount = numbers.filter(n => n%2).length;
      if (totalSum < minSum || totalSum > maxSum || oddCount < minOdd || oddCount > maxOdd) return -1;
      let rank=0,start=0,left=needed,subtotal=fixedSum,odd=fixedOdd;
      for (const n of [...numbers].filter(n => !fixed.includes(n)).sort((a,b)=>a-b)) {
        const index=pool.indexOf(n);
        for(let i=start;i<index;i++) rank += count(i+1,left-1,subtotal+pool[i],odd+pool[i]%2);
        start=index+1; left--; subtotal+=n; odd+=n%2;
      }
      return rank;
    }
    return {total,unrank,rankOf};
  }
  function generate(options={}, amount=5, blocked=[], rng=randomInt) {
    if (!Number.isInteger(amount) || amount < 1 || amount > 20) throw new Error('한 번에 1~20게임을 생성할 수 있습니다.');
    const space=createSpace(options);
    const skipped=[...new Set(blocked.map(n => space.rankOf(n)).filter(n => n>=0))].sort((a,b)=>a-b);
    const available=space.total-skipped.length;
    if (available < amount) throw new Error(`현재 조건에서 생성 가능한 새 조합은 ${available.toLocaleString('ko-KR')}개입니다. 게임 수를 줄이거나 조건을 풀어 주세요.`);
    // Floyd's algorithm samples unique indices in bounded time, even for a tiny pool.
    const selected = new Set();
    for (let j=available-amount;j<available;j++) {
      const candidate=rng(j+1);
      if (!Number.isInteger(candidate) || candidate < 0 || candidate > j) throw new Error('난수 인덱스가 범위를 벗어났습니다.');
      selected.add(selected.has(candidate) ? j : candidate);
    }
    const numbers=[...selected].map(index => {
      let rank=index;
      for (const skip of skipped) { if (skip <= rank) rank++; else break; }
      return space.unrank(rank);
    });
    // Shuffle presentation order independently of combination selection.
    for(let i=numbers.length-1;i>0;i--) { const j=rng(i+1); [numbers[i],numbers[j]]=[numbers[j],numbers[i]]; }
    return {numbers,total:space.total,available};
  }
  function match(numbers,winning,bonus=null) {
    if (!validNumbers(numbers,6) || !validNumbers(winning,6) || (bonus !== null && (!Number.isInteger(bonus) || bonus<1 || bonus>45 || winning.includes(bonus)))) throw new Error('당첨번호는 서로 다른 6개이며, 보너스 번호는 당첨번호와 달라야 합니다.');
    const hits=numbers.filter(n=>winning.includes(n)).length;
    const bonusHit=bonus !== null && numbers.includes(bonus);
    const rank=hits===6 ? 1 : hits===5 ? (bonus===null ? null : bonusHit ? 2 : 3) : hits===4 ? 4 : hits===3 ? 5 : 0;
    return {hits,bonusHit,rank,label:rank ? `${rank}등` : hits===5 ? '2·3등 (보너스 필요)' : '미당첨'};
  }
  function metrics(numbers) {
    const sorted=[...numbers].sort((a,b)=>a-b);
    return {sum:sum(numbers),odd:numbers.filter(n=>n%2).length,consecutive:sorted.slice(1).filter((n,i)=>n===sorted[i]+1).length};
  }
  function jackpotProbability(games) {
    const unique=new Set(games.filter(n=>validNumbers(n,6)).map(key)).size;
    return {unique,total:TOTAL,probability:unique/TOTAL};
  }
  const api={TOTAL,key,validNumbers,randomInt,createSpace,generate,match,metrics,jackpotProbability};
  if(typeof module !== 'undefined' && module.exports) module.exports=api;
  root.LottoCore=api;
})(typeof window !== 'undefined' ? window : globalThis);
