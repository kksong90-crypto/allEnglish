/* Presentation only. Exact book/revision/section identities stay untouched. */
var CanonicalScopeDisplay = (function () {
  function text(v) { return String(v == null ? '' : v).trim(); }
  function field(row, camel, snake) { return row[camel] == null ? row[snake] : row[camel]; }
  function type(value) {
    var key = text(value).toUpperCase();
    return ({CHAPTER:'LESSON',LECTURE:'UNIT',ITEM:'QUESTION',SESSION:'ROUND'})[key] || key || 'CUSTOM';
  }
  function compact(values) {
    var sorted = Array.from(new Set(values)).sort(function(a,b){return a-b;}), parts = [];
    for (var i=0;i<sorted.length;i++) {
      var first=sorted[i],last=first;
      while(i+1<sorted.length && sorted[i+1]===last+1) last=sorted[++i];
      parts.push(first===last?String(first):first+'-'+last);
    }
    return parts.join(', ');
  }
  function sectionText(kind, sections) {
    if(kind==='CUSTOM') {
      var labels=sections.map(function(s){return text(s.label);});
      var groups=new Map(),matched=labels.every(function(label){
        var m=label.match(/^(?:(\d+)\s*회\s*[·:：-]?\s*)?(?:(\d+)\s*강\s*)?(\d+)\s*(번|과|강)$/);
        if(!m) return false;
        var prefix=m[2]?m[2]+'강 ':m[1]?m[1]+'회 · ':'',key=prefix+'|'+m[4];
        if(!groups.has(key))groups.set(key,{prefix:prefix,suffix:m[4],values:[]});
        groups.get(key).values.push(Number(m[3]));return true;
      });
      if(matched&&labels.length) return Array.from(groups.values()).map(function(g){
        return g.prefix+compact(g.values)+g.suffix;
      }).join(', ');
    }
    var known=['DAY','QUESTION','LESSON','UNIT','ROUND'].indexOf(kind)>=0;
    var nums=sections.map(function(s){
      var n=text(field(s,'sectionNo','section_no'));
      return /^[0-9]+$/.test(n)&&Number(n)>0?Number(n):null;
    });
    if(known && nums.every(function(n){return n!==null;})) {
      var value=compact(nums);
      return kind==='DAY'?'Day '+value:value+(({LESSON:'과',UNIT:'강',ROUND:'회'})[kind]||'');
    }
    return Array.from(new Set(sections.map(function(s){
      return text(s.label || field(s,'sectionNo','section_no'));
    }).filter(Boolean))).join(', ');
  }
  function format(ranges, books) {
    if(!Array.isArray(ranges)||!ranges.length||!Array.isArray(books)) return '';
    var groups=new Map();
    for(var range of ranges) {
      var bookId=text(range.vocabBookId||range.vocab_book_id||range.bookId);
      var revisionId=text(range.revisionId||range.revision_id);
      var matches=books.filter(function(b){
        return text(b.revisionId||b.revision_id)===revisionId
          && text(b.bookId||b.vocab_book_id||b.vocabBookId)===bookId;
      });
      if(matches.length!==1) return '';
      var book=matches[0], name=text(book.displayName||book.display_name||book.name);
      var ids=range.sectionIds||range.section_ids;
      if(!name||!Array.isArray(ids)||!ids.length||!Array.isArray(book.sections)) return '';
      var key=JSON.stringify([bookId,revisionId]), group=groups.get(key);
      if(!group) { group={book:book,name:name,types:new Map()};groups.set(key,group); }
      for(var id of ids) {
        var found=book.sections.filter(function(s){return text(s.sectionId||s.section_id)===text(id);});
        if(found.length!==1) return '';
        var section=found[0],kind=type(section.sectionType||section.section_type);
        var values=group.types.get(kind);
        if(!values) {values=new Map();group.types.set(kind,values);}
        values.set(text(id),section);
      }
    }
    var names=new Map();
    groups.forEach(function(g){names.set(g.name,(names.get(g.name)||0)+1);});
    var lines=[];
    groups.forEach(function(g){
      var name=g.name;
      if(names.get(name)>1) {
        var edition=text(g.book.editionLabel||g.book.edition_label);
        var revision=text(g.book.revisionNo||g.book.revision_no);
        // Distinguish revisions without exposing internal IDs.
        name+=' ('+(edition||'개정 '+(revision||'?'))+')';
      }
      var pieces=[];
      g.types.forEach(function(values,kind){
        var selected=Array.from(values.values()).sort(function(a,b){
          return Number(field(a,'sortOrder','sort_order')||0)-Number(field(b,'sortOrder','sort_order')||0);
        });
        pieces.push(sectionText(kind,selected));
      });
      if(pieces.some(function(p){return !p;})) {lines.push('');return;}
      lines.push(name+' '+pieces.join(' · '));
    });
    return lines.some(function(l){return !l;})?'':lines.join('\n');
  }
  return {format:format,compact:compact};
})();
if(typeof module!=='undefined'&&module.exports) module.exports=CanonicalScopeDisplay;
