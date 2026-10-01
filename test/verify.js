/* 回声电台 ARG · 端到端验证（CDP 驱动真实 Chrome，走完整条谜题链） */
const PORT = 9333;
const URL_ = process.argv[2];
let id = 0;
const pending = new Map();
const errors = [];
const results = [];
function ok(name, cond, extra) {
  const line = (cond ? '  \u2713 ' : '  \u2717 ') + name + (extra !== undefined ? '  [' + extra + ']' : '');
  results.push(line);
  console.log(line);
  return cond;
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function main() {
  let targets;
  for (let i = 0; i < 60; i++) {
    try {
      targets = await (await fetch('http://127.0.0.1:' + PORT + '/json/list')).json();
      if (targets.some(t => t.type === 'page')) break;
    } catch (e) { }
    await sleep(300);
  }
  const page = targets.find(t => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise(r => { ws.onopen = r; });

  function send(method, params) {
    return new Promise((res, rej) => {
      const i = ++id;
      pending.set(i, { res, rej });
      ws.send(JSON.stringify({ id: i, method, params }));
    });
  }
  ws.onmessage = ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const p = pending.get(m.id); pending.delete(m.id);
      m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result);
      return;
    }
    if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params.exceptionDetails;
      errors.push('EXCEPTION: ' + ((d.exception && d.exception.description) || d.text));
    }
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
      errors.push('CONSOLE.error: ' + m.params.args.map(a => a.value || a.description || '').join(' '));
    }
  };
  await send('Runtime.enable', {});
  await send('Page.enable', {});
  await send('Page.navigate', { url: URL_ });
  await sleep(2600);

  async function ev(expr) {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) {
      const d = r.exceptionDetails;
      throw new Error('EVAL FAILED: ' + ((d.exception && d.exception.description) || d.text) + '\n    expr: ' + expr.slice(0, 120));
    }
    return r.result.value;
  }

  /* ── 1. 首屏 ── */
  ok('首屏提示存在', await ev(`!!document.querySelector('#boot')`));
  ok('标题正确', (await ev(`document.title`)) === '回声电台 ECHO FM · 非官方档案馆', await ev(`document.title`));
  ok('首页渲染出内容', await ev(`document.querySelector('#page').textContent.includes('非官方档案馆')`));
  ok('白天皮肤', (await ev(`document.body.dataset.mode`)) === 'day');
  ok('留言板默认锁定', await ev(`!!document.querySelector('#navbar a.lock')`));
  ok('顶栏未折行', (await ev(`document.querySelector('#topbar').getBoundingClientRect().height`)) < 95,
    await ev(`Math.round(document.querySelector('#topbar').getBoundingClientRect().height)`));
  ok('马赛克噪点层已生成', await ev(`document.querySelector('#noise').style.backgroundImage.indexOf('data:image/png')>0`));

  /* ── 2. 关闭提示 ── */
  await ev(`document.querySelector('#bootFull').click(); 'ok'`);
  await sleep(500);
  ok('AudioContext 可用', await ev(`(function(){try{return !!(window.AudioContext||window.webkitAudioContext)}catch(e){return false}})()`));

  /* ── 3. 谜题链：调频到 87.6 ── */
  await ev(`location.hash='#/listen'; 'ok'`);
  await sleep(700);
  ok('调谐器已渲染', await ev(`!!document.querySelector('#tune')`));
  ok('频谱 canvas 有尺寸', await ev(`document.querySelector('#spec').width>100`), await ev(`document.querySelector('#spec').width`));

  const farSig = await ev(`(function(){const t=document.querySelector('#tune');t.value=934;t.dispatchEvent(new Event('input',{bubbles:true}));return document.querySelector('#sigTxt').textContent})()`);
  ok('未调准时无信号', /\d+%/.test(farSig) && parseInt(farSig.match(/(\d+)%/)[1]) < 30, farSig);

  const tuned = await ev(`(function(){const t=document.querySelector('#tune');t.value=876;t.dispatchEvent(new Event('input',{bubbles:true}));return document.querySelector('#sigTxt').textContent+' | '+document.querySelector('#freqDisp').textContent})()`);
  ok('87.6 锁定', tuned.indexOf('100%') >= 0, tuned);
  ok('手动频率入口默认禁用', await ev(`document.querySelector('#manualFreq').disabled`));

  /* ── 4. 收听录音 → 裂开 ── */
  await sleep(2000);
  ok('录音正在逐字播出', await ev(`document.querySelector('#subs').textContent.length>10`));
  await ev(`document.querySelector('#subs').click(); 'ok'`);   /* 跳过 */
  await sleep(4500);
  ok('皮肤已裂开为深夜态', (await ev(`document.body.dataset.mode`)) === 'night');
  ok('留言板已解锁', await ev(`!document.querySelector('#navbar a.lock')`));
  ok('手动频率入口已启用', await ev(`!document.querySelector('#manualFreq').disabled`));

  /* ── 5. 留言板第 41 页 + 加密附件 ── */
  await ev(`location.hash='#/board/41'; 'ok'`);
  await sleep(700);
  ok('留言板第 41 页有附件', await ev(`!!document.querySelector('#zipAtt')`));
  ok('第 41 页有今天的留言', await ev(`document.querySelector('.post.new')!==null`));
  ok('存在「沉默的听者」', await ev(`document.querySelector('#page').textContent.includes('沉默的听者')`));
  ok('存在 1998 年的时间戳', await ev(`document.querySelector('#page').textContent.includes('1998-11-03 03:17')`));

  await ev(`document.querySelector('#zipAtt').click(); 'ok'`);
  await sleep(400);
  ok('解压弹窗打开', await ev(`!!document.querySelector('#zipPw')`));
  await ev(`(function(){document.querySelector('#zipPw').value='0000';document.querySelector('#zipOk').click();})(); 'ok'`);
  await sleep(300);
  ok('错误密码被拒绝', await ev(`document.querySelector('#zipMsg').textContent.includes('错误')`));
  await ev(`(function(){document.querySelector('#zipPw').value='1103';document.querySelector('#zipOk').click();})(); 'ok'`);
  await sleep(500);
  ok('正确密码解出转写稿', await ev(`!!document.querySelector('#trBox')`));

  /* ── 6. 隐藏文字（必须"框"出来） ── */
  const deadInfo = await ev(`(function(){var d=document.querySelector('.dead');if(!d)return null;var cs=getComputedStyle(d);return {color:cs.color, text:d.textContent}})()`);
  ok('存在隐藏文字节点', !!deadInfo, deadInfo && deadInfo.text);
  ok('隐藏文字默认透明', deadInfo && deadInfo.color === 'rgba(0, 0, 0, 0)', deadInfo && deadInfo.color);
  ok('隐藏内容即最终答案', deadInfo && deadInfo.text.indexOf('417') >= 0, deadInfo && deadInfo.text);

  /* 模拟"框选"（真实的 selectionchange 路径） */
  await ev(`(function(){
    var d=document.querySelector('.dead');
    var r=document.createRange(); r.selectNodeContents(d);
    var s=getSelection(); s.removeAllRanges(); s.addRange(r);
    document.dispatchEvent(new Event('selectionchange'));
    return d.className;
  })()`);
  await sleep(200);
  ok('框选后隐藏文字显形', await ev(`document.querySelector('.dead').classList.contains('lit')`));
  ok('显形后颜色可见', (await ev(`getComputedStyle(document.querySelector('.dead')).color`)) !== 'rgba(0, 0, 0, 0)');

  /* ── 7. 输入 417 → 终局 ── */
  await ev(`document.querySelector('#trClose').click(); location.hash='#/listen'; 'ok'`);
  await sleep(700);
  await ev(`(function(){document.querySelector('#manualFreq').value='417';document.querySelector('#btnManual').click();})(); 'ok'`);
  await sleep(1200);
  ok('终局层已开启', await ev(`document.querySelector('#endgame').classList.contains('on')`));
  await sleep(4500);
  ok('终局人脸已绘制', await ev(`(function(){var c=document.querySelector('#face');var x=c.getContext('2d').getImageData(0,0,c.width,c.height).data;var n=0;for(var i=3;i<x.length;i+=4){if(x[i]>10)n++;}return n;})()`) > 500,
    await ev(`(function(){var c=document.querySelector('#face');var x=c.getContext('2d').getImageData(0,0,c.width,c.height).data;var n=0;for(var i=3;i<x.length;i+=4){if(x[i]>10)n++;}return n;})()`));

  /* 等终局演完 */
  for (let i = 0; i < 90; i++) {
    if (await ev(`!!document.querySelector('#endClose')`)) break;
    await sleep(1000);
  }
  ok('终局出现关闭按钮', await ev(`!!document.querySelector('#endClose')`));
  ok('终局文字包含"沈默"', await ev(`document.querySelector('#endtext').textContent.includes('沈默')`));

  /* ── 8. 收尾：回到留言板，多出自己那条 ── */
  await ev(`document.querySelector('#endClose').click(); 'ok'`);
  await sleep(1200);
  ok('终局层已关闭', await ev(`!document.querySelector('#endgame').classList.contains('on')`));
  ok('自动跳回第 41 页', (await ev(`location.hash`)) === '#/board/41', await ev(`location.hash`));
  ok('留言板出现「你」的留言', await ev(`document.querySelector('#page').textContent.includes('你')&&document.querySelectorAll('.post.new').length>=1`));
  ok('在线听众变为 2', (await ev(`document.querySelector('#listeners').textContent`)) === '2');
  ok('访问量已 +1', (await ev(`document.querySelector('#visits').textContent`)) === '000134', await ev(`document.querySelector('#visits').textContent`));
  ok('页脚出现「再听一次结局」', await ev(`!!document.querySelector('#btnReplay')`));

  /* ── 9. 刷新后状态保持 ── */
  await send('Page.navigate', { url: URL_ });
  await sleep(2600);
  ok('刷新后保持深夜态', (await ev(`document.body.dataset.mode`)) === 'night');
  ok('刷新后仍是 2 位听众', (await ev(`document.querySelector('#listeners').textContent`)) === '2');

  /* ── 10. 其余路由不报错 ── */
  for (const r of ['home', 'schedule', 'schedule/1998-11-03', 'host', 'about', 'listen', 'board/1', 'board/43']) {
    await ev(`location.hash='#/${r}'; 'ok'`);
    await sleep(320);
    const len = await ev(`document.querySelector('#page').textContent.trim().length`);
    ok('路由 #/' + r + ' 正常', len > 40, len + ' 字');
  }

  /* ── 汇总 ── */
  console.log('\n=== 端到端验证结果 ===');
  console.log(results.join('\n'));
  const fail = results.filter(r => r.indexOf('\u2717') >= 0);
  console.log('\n通过 ' + (results.length - fail.length) + ' / ' + results.length);
  if (errors.length) {
    console.log('\n=== 运行时错误 (' + errors.length + ') ===');
    console.log([...new Set(errors)].slice(0, 20).join('\n'));
  } else {
    console.log('运行时错误：无');
  }
  ws.close();
  process.exit(fail.length || errors.length ? 1 : 0);
}
main().catch(e => {
  console.error('\n!!! TEST HARNESS ERROR:', e.message);
  console.error('--- 到此为止已执行的断言 ---');
  console.error(results.join('\n'));
  if (errors.length) console.error('--- 运行时错误 ---\n' + [...new Set(errors)].slice(0, 20).join('\n'));
  process.exit(2);
});
