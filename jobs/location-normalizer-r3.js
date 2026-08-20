(() => {
  const STATE_ALIASES = {
    AL:['alabama','阿拉巴马'],AK:['alaska','阿拉斯加'],AZ:['arizona','亚利桑那'],AR:['arkansas','阿肯色'],CA:['california','加州','加利福尼亚'],CO:['colorado','科罗拉多'],CT:['connecticut','康涅狄格'],DE:['delaware','特拉华'],DC:['washington dc','district of columbia','华盛顿特区'],FL:['florida','佛州','佛罗里达'],GA:['georgia','乔治亚','佐治亚'],HI:['hawaii','夏威夷'],ID:['idaho','爱达荷'],IL:['illinois','伊利诺伊'],IN:['indiana','印第安纳'],IA:['iowa','爱荷华'],KS:['kansas','堪萨斯'],KY:['kentucky','肯塔基'],LA:['louisiana','路易斯安那'],ME:['maine','缅因'],MD:['maryland','马里兰'],MA:['massachusetts','麻州','马萨诸塞'],MI:['michigan','密歇根'],MN:['minnesota','明尼苏达'],MS:['mississippi','密西西比'],MO:['missouri','密苏里'],MT:['montana','蒙大拿'],NE:['nebraska','内布拉斯加'],NV:['nevada','内华达'],NH:['new hampshire','新罕布什尔'],NJ:['new jersey','新泽西'],NM:['new mexico','新墨西哥'],NY:['new york','纽约州','纽约'],NC:['north carolina','北卡','北卡罗来纳'],ND:['north dakota','北达科他'],OH:['ohio','俄亥俄'],OK:['oklahoma','俄克拉何马'],OR:['oregon','俄勒冈'],PA:['pennsylvania','宾州','宾夕法尼亚'],RI:['rhode island','罗得岛'],SC:['south carolina','南卡','南卡罗来纳'],SD:['south dakota','南达科他'],TN:['tennessee','田纳西'],TX:['texas','德州','得州','德克萨斯'],UT:['utah','犹他'],VT:['vermont','佛蒙特'],VA:['virginia','弗吉尼亚'],WA:['washington state','华盛顿州'],WV:['west virginia','西弗吉尼亚'],WI:['wisconsin','威斯康星','威斯康辛'],WY:['wyoming','怀俄明']
  };

  const COMMON_PLACES = [
    {aliases:['纽约法拉盛','法拉盛','flushing ny','flushing new york'],state_code:'NY',city:'New York City',county:'Queens County',borough:'Queens',neighborhood:'Flushing',latitude:40.7675,longitude:-73.8331,label:'法拉盛, NY'},
    {aliases:['纽约皇后区','皇后区','queens ny','queens new york'],state_code:'NY',city:'New York City',county:'Queens County',borough:'Queens',neighborhood:null,latitude:40.7282,longitude:-73.7949,label:'皇后区, NY'},
    {aliases:['纽约布鲁克林','布鲁克林','brooklyn ny','brooklyn new york'],state_code:'NY',city:'New York City',county:'Kings County',borough:'Brooklyn',neighborhood:null,latitude:40.6782,longitude:-73.9442,label:'布鲁克林, NY'},
    {aliases:['纽约曼哈顿','曼哈顿','manhattan ny','manhattan new york'],state_code:'NY',city:'New York City',county:'New York County',borough:'Manhattan',neighborhood:null,latitude:40.7831,longitude:-73.9712,label:'曼哈顿, NY'},
    {aliases:['威斯康星麦迪逊','威斯康辛麦迪逊','麦迪逊威斯康星','madison wi','madison wisconsin'],state_code:'WI',city:'Madison',county:'Dane County',borough:null,neighborhood:null,latitude:43.0731,longitude:-89.4012,label:'麦迪逊, WI'},
    {aliases:['威斯康星密尔沃基','威斯康辛密尔沃基','密尔沃基威斯康星','milwaukee wi','milwaukee wisconsin'],state_code:'WI',city:'Milwaukee',county:'Milwaukee County',borough:null,neighborhood:null,latitude:43.0389,longitude:-87.9065,label:'密尔沃基, WI'},
    {aliases:['洛杉矶','los angeles ca','los angeles california'],state_code:'CA',city:'Los Angeles',county:'Los Angeles County',borough:null,neighborhood:null,latitude:34.0522,longitude:-118.2437,label:'洛杉矶, CA'},
    {aliases:['蒙特利公园','monterey park ca'],state_code:'CA',city:'Monterey Park',county:'Los Angeles County',borough:null,neighborhood:null,latitude:34.0625,longitude:-118.1228,label:'蒙特利公园, CA'},
    {aliases:['圣盖博','san gabriel ca'],state_code:'CA',city:'San Gabriel',county:'Los Angeles County',borough:null,neighborhood:null,latitude:34.0961,longitude:-118.1058,label:'圣盖博, CA'},
    {aliases:['旧金山','san francisco ca'],state_code:'CA',city:'San Francisco',county:'San Francisco County',borough:null,neighborhood:null,latitude:37.7749,longitude:-122.4194,label:'旧金山, CA'},
    {aliases:['西雅图','seattle wa'],state_code:'WA',city:'Seattle',county:'King County',borough:null,neighborhood:null,latitude:47.6062,longitude:-122.3321,label:'西雅图, WA'},
    {aliases:['休斯顿','houston tx'],state_code:'TX',city:'Houston',county:'Harris County',borough:null,neighborhood:null,latitude:29.7604,longitude:-95.3698,label:'休斯顿, TX'},
    {aliases:['达拉斯','dallas tx'],state_code:'TX',city:'Dallas',county:'Dallas County',borough:null,neighborhood:null,latitude:32.7767,longitude:-96.797,label:'达拉斯, TX'},
    {aliases:['芝加哥','chicago il'],state_code:'IL',city:'Chicago',county:'Cook County',borough:null,neighborhood:null,latitude:41.8781,longitude:-87.6298,label:'芝加哥, IL'},
    {aliases:['波士顿','boston ma'],state_code:'MA',city:'Boston',county:'Suffolk County',borough:null,neighborhood:null,latitude:42.3601,longitude:-71.0589,label:'波士顿, MA'}
  ];

  const clean = (value) => String(value || '').trim().toLowerCase().replace(/[，,、/\\|]+/g,' ').replace(/\s+/g,' ');
  const compact = (value) => clean(value).replace(/\s+/g,'');

  function fromDiscoveryArea(row) {
    return {
      state_code: row.state_code || null,
      city: row.city || null,
      county: row.county || null,
      borough: row.borough || null,
      neighborhood: row.neighborhood || null,
      latitude: row.center_latitude == null ? null : Number(row.center_latitude),
      longitude: row.center_longitude == null ? null : Number(row.center_longitude),
      label: row.label_zh || row.label_en || row.slug,
      source: 'catalog'
    };
  }

  function resolve(input, areas = []) {
    const raw = String(input || '').trim();
    if (!raw) return null;
    const key = clean(raw); const packed = compact(raw);

    for (const row of areas) {
      const candidates = [row.label_zh,row.label_en,row.slug,row.city,row.borough,row.neighborhood].filter(Boolean);
      if (candidates.some((value) => clean(value) === key || packed.includes(compact(value)))) {
        const match = fromDiscoveryArea(row);
        if (match.state_code && match.city) return match;
      }
    }

    for (const place of COMMON_PLACES) {
      if (place.aliases.some((alias) => key === clean(alias) || packed.includes(compact(alias)))) return {...place,source:'builtin'};
    }

    let stateCode = null;
    for (const [code, aliases] of Object.entries(STATE_ALIASES)) {
      if (aliases.some((alias) => key.includes(clean(alias))) || new RegExp(`(^|\\s)${code.toLowerCase()}($|\\s)`).test(key)) { stateCode = code; break; }
    }
    if (!stateCode) return null;

    const stripped = raw
      .replace(/[，,、/\\|]+/g,' ')
      .replace(new RegExp(`\\b${stateCode}\\b`,'ig'),' ')
      .replace(new RegExp(STATE_ALIASES[stateCode].map((v)=>v.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|'),'ig'),' ')
      .replace(/州/g,' ')
      .replace(/\s+/g,' ')
      .trim();
    if (!stripped) return {state_code:stateCode,city:null,county:null,borough:null,neighborhood:null,latitude:null,longitude:null,label:stateCode,source:'state-only'};
    return {state_code:stateCode,city:stripped,county:null,borough:null,neighborhood:null,latitude:null,longitude:null,label:`${stripped}, ${stateCode}`,source:'parsed'};
  }

  async function loadAreas(client) {
    if (!client) return [];
    const {data,error} = await client.from('job_discovery_areas').select('slug,label_zh,label_en,state_code,city,county,borough,neighborhood,center_latitude,center_longitude').eq('is_active',true).order('sort_order');
    return error ? [] : (data || []);
  }

  window.JobsR3Location = { resolve, loadAreas, COMMON_PLACES, STATE_ALIASES };
})();
