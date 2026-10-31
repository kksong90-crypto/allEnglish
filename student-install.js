(function () {
  'use strict';
  var ua = navigator.userAgent || '';
  var ios = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  var android = /Android/i.test(ua);
  var embedded = /KAKAOTALK|NAVER|Instagram|FBAN|FBAV|Line\//i.test(ua);
  var deferred = null;
  var busy = false;
  var installedHere = false;
  var action = document.getElementById('install-action');
  var title = document.getElementById('step-title');
  var message = document.getElementById('install-message');
  var steps = document.getElementById('install-steps');
  var addressHelp = document.getElementById('address-help');
  var address = document.getElementById('install-address');
  var installURL = new URL('install.html', location.href).href;
  address.value = installURL;
  function standalone() {
    return navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
  }
  function list(items) {
    steps.replaceChildren();
    items.forEach(function (text) {
      var li = document.createElement('li');
      li.textContent = text;
      steps.appendChild(li);
    });
    steps.hidden = false;
  }
  function render() {
    if (standalone()) {
      title.textContent = '홈 화면에서 실행했어요';
      message.textContent = '이제 학생웹앱으로 이동해서 로그인하세요.';
      action.textContent = '학생웹앱 시작하기';
    } else if (installedHere) {
      title.textContent = '설치가 완료됐어요';
      message.textContent = '이 화면을 닫고 홈 화면이나 앱 목록에서 All바른 아이콘을 찾아 눌러 주세요.';
      action.textContent = '학생웹앱 열기';
    } else if (embedded) {
      message.textContent = '지금은 다른 앱 안에서 열렸어요. 먼저 '+(ios ? 'Safari' : 'Chrome 또는 기본 브라우저')+'에서 이 주소를 열어 주세요.';
      action.textContent = '브라우저로 여는 방법 보기';
    } else if (ios) {
      message.textContent = '아이폰은 공유 메뉴에서 홈 화면에 추가할 수 있어요.';
      action.textContent = '아이폰 설치 방법 보기';
    } else if (deferred) {
      message.textContent = '아래 버튼을 누른 뒤, 휴대폰이 보여주는 설치창에서 확인해 주세요.';
      action.textContent = 'All바른 학생앱 설치';
    } else {
      message.textContent = '브라우저 메뉴에서 홈 화면에 추가할 수 있어요. 설치창이 준비되면 이 버튼으로도 설치할 수 있어요.';
      action.textContent = '홈 화면에 추가하는 방법';
    }
  }
  window.addEventListener('beforeinstallprompt', function (event) {
    event.preventDefault(); deferred = event; render();
  });
  window.addEventListener('appinstalled', function () {
    installedHere = true; deferred = null; steps.hidden = true; render();
  });
  action.addEventListener('click', async function () {
    if (busy) return;
    if (standalone() || installedHere) { location.assign('./'); return; }
    if (embedded) {
      list(['브라우저의 더보기 메뉴에서 외부 브라우저로 열기를 찾아 선택하세요. 메뉴 이름은 앱에 따라 달라요.',
        '메뉴가 없으면 아래 주소를 복사한 뒤 '+(ios ? 'Safari' : 'Chrome')+'의 주소창에 붙여 넣으세요.',
        '새 브라우저에서 다시 설치 안내 버튼을 눌러 주세요.']);
      addressHelp.hidden = false; return;
    }
    if (ios) {
      list(['Safari에서 이 페이지를 여세요. 이미 Safari라면 그대로 진행하세요.',
        '공유 버튼(네모에서 화살표가 나오는 모양)을 누르세요. 브라우저 버전에 따라 더보기 메뉴 안에 있어요.',
        '홈 화면에 추가를 선택하세요. 보이지 않으면 목록을 아래로 내려 확인하세요.',
        '웹 앱으로 열기 항목이 있으면 켜고, 추가를 누르세요.',
        '이 화면을 닫고 홈 화면의 All바른 아이콘을 눌러 로그인하세요.']);
      addressHelp.hidden = false; return;
    }
    if (deferred) {
      var event = deferred; deferred = null; busy = true; action.disabled = true;
      try {
        await event.prompt();
        var result = await event.userChoice;
        render();
        message.textContent = result.outcome === 'accepted'
          ? '설치를 요청했어요. 휴대폰에서 설치가 끝나면 홈 화면이나 앱 목록의 All바른 아이콘을 눌러 주세요.'
          : '설치를 취소했어요. 브라우저 메뉴에서 다시 추가하거나 설치 없이 사용할 수 있어요.';
      } catch (_) {
        render(); message.textContent = '설치창을 열지 못했어요. 브라우저 메뉴의 앱 설치 또는 홈 화면에 추가를 이용해 주세요.';
      } finally { busy = false; action.disabled = false; }
      return;
    }
    list(android ? ['Chrome의 더보기(⋮) 메뉴를 누르세요.',
      '홈 화면에 추가 또는 앱 설치를 선택하고, 표시되는 확인 버튼을 누르세요.',
      '메뉴가 없으면 Chrome에서 다시 열거나 이미 설치된 아이콘이 있는지 확인하세요.',
      '추가한 All바른 아이콘으로 실행하고 로그인하세요.']
      : ['휴대폰에서는 기본 카메라로 QR을 찍어 이 페이지를 여세요.',
      '안드로이드는 Chrome 메뉴의 앱 설치 / 홈 화면에 추가, 아이폰은 Safari 공유 메뉴의 홈 화면에 추가를 이용하세요.',
      '컴퓨터에서는 지원하는 브라우저의 주소창이나 메뉴에서 앱 설치를 확인하세요.']);
  });
  document.getElementById('copy-address').addEventListener('click', async function () {
    try {
      await navigator.clipboard.writeText(installURL);
      message.textContent = '주소를 복사했어요. '+(ios ? 'Safari' : 'Chrome')+'의 주소창에 붙여 넣어 주세요.';
    } catch (_) {
      address.focus(); address.select();
      message.textContent = '자동 복사를 사용할 수 없어요. 아래 주소를 길게 눌러 복사해 주세요.';
    }
  });
  window.addEventListener('pageshow', render);
  render();
}());
