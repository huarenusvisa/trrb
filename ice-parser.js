function renderICE(item){

const hasImage =
item.image &&
item.image !== "null";


if(hasImage){

return `

<article class="ice-card">

<img 
src="${item.image}"
alt="${item.title || 'ICE执法新闻'}"
loading="lazy"
>

<h3>
${item.title || ''}
</h3>

<p>
${item.summary || ''}
</p>

<div class="topic-time">
${item.time || ''}
</div>

<div class="topic-source">
来源：${item.source || ''}
</div>

</article>

`;

}


return `

<article class="ice-text-card">

<h3>
${shortIceTitle(item.title || 'ICE执法行动')}
</h3>

<p>
${item.summary || ''}
</p>

<div class="topic-time">
${item.time || ''}
</div>

<div class="topic-source">
来源：${item.source || ''}
</div>

</article>

`;

}



function shortIceTitle(title){

if(title.length <= 18)
return title;

return title.substring(0,18);

}
