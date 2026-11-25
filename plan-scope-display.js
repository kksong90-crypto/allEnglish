/* One metadata lookup per signed-in session; no vocabulary-word download. */
var PlanScopePresentation = (function () {
  var owner='', pending=null;
  function reset() { owner='';pending=null; }
  async function enrich(payload, user, readCatalog) {
    if(typeof CanonicalScopeDisplay==='undefined'||!user||!user.token) return payload;
    var plans=new Set();
    function visit(day) {
      (day&&Array.isArray(day.vocab)?day.vocab:[]).forEach(function(item){
        if(item.vocaScopeState!=='DUPLICATE'&&Array.isArray(item.sourceRanges)&&item.sourceRanges.length) plans.add(item);
      });
    }
    visit(payload.nextPlan);
    ['days','visibleDays'].forEach(function(key){(payload[key]||[]).forEach(visit);});
    if(!plans.size) return payload;
    var key=String(user.token);
    if(owner!==key) {reset();owner=key;}
    if(!pending) pending=Promise.resolve().then(readCatalog).then(function(result){
      if(result?.success!==true||!Array.isArray(result.books)) throw Error('CATALOG_UNAVAILABLE');
      return result.books;
    });
    var request=pending,books;
    try {books=await request;} catch(ignore) {if(pending===request) pending=null;return payload;}
    if(owner!==key||pending!==request) return payload;
    plans.forEach(function(item){
      var formatted=CanonicalScopeDisplay.format(item.sourceRanges,books);
      if(formatted) {
        // A managed school scope may be the only canonical component in older
        // Student API responses. Keep the separately published regular scope.
        var regular=String(item.regularText||'').trim();
        if(item.schoolScopePlanId&&regular) {
          var name=String(item.vocabBookName||item.bookName||item.groupName||'').trim();
          formatted=[name&&regular.indexOf(name)<0?name+' '+regular:regular,formatted].join('\n');
        }
        item.scopeDisplayText=formatted;
      }
    });
    return payload;
  }
  function display(item) { return item.scopeDisplayText || item.displayText || ''; }
  return {enrich:enrich,display:display,reset:reset};
})();
