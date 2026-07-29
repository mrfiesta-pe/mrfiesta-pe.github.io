import { db as _supabase } from './services/supabase.js';
import { APPS_SCRIPT_URL } from './core/config.js';

const slugGaleria = new URLSearchParams(location.search).get('galeria');
let galeriaUuid='', folderIdDrive='', subfolderIdDrive='', limiteMaximo=100, conMarcaAgua=true, galeriaAprobada=false;
let fotosSeleccionadas=[], fotosYaRegistradas=new Set(), seleccionYaEnviada=false, fotos=[], indiceLightbox=0;
let temporizadorAutoguardado=null, guardadoEnCurso=false, versionSeleccion=0;

const $=s=>document.querySelector(s);

function toast(message,type='info'){
    const el=document.createElement('div');
    el.className='toast';
    el.textContent=message;
    $('#toast-stack').append(el);
    setTimeout(()=>el.remove(),3800);
}

function escapeHtml(v){
    const d=document.createElement('div');
    d.textContent=v;
    return d.innerHTML;
}

function actualizarContadorUI(){
    const count=fotosSeleccionadas.length, faltan=Math.max(0,limiteMaximo-count);
    $('#contador-favoritas').textContent=`${count} / ${limiteMaximo} seleccionadas`;
    $('#barra-progreso').style.width=`${Math.min(100,count/limiteMaximo*100)}%`;
    $('#estado-contador').textContent=galeriaAprobada?'Selección aprobada':faltan?`Aún puedes elegir ${faltan}`:'Límite cubierto';
}

function claveBorrador(){
    return `mrfiesta:seleccion:${galeriaUuid}`;
}

function programarAutoguardado(){
    if(!galeriaUuid||galeriaAprobada)return;
    versionSeleccion++;
    localStorage.setItem(claveBorrador(),JSON.stringify(fotosSeleccionadas));
    clearTimeout(temporizadorAutoguardado);
    temporizadorAutoguardado=setTimeout(guardarBorradorEnSupabase,450);
}

async function guardarBorradorEnSupabase(){
    if(guardadoEnCurso||!galeriaUuid)return;
    guardadoEnCurso=true;
    const versionActual=versionSeleccion,ids=[...fotosSeleccionadas];
    try{
        const {error:borradoError}=await _supabase.from('selecciones').delete().eq('galeria_id',galeriaUuid);
        if(borradoError)throw borradoError;
        if(ids.length){
            const {error:insertError}=await _supabase.from('selecciones').insert(ids.map(foto_id=>({galeria_id:galeriaUuid,foto_id})));
            if(insertError)throw insertError;
        }
    }catch(error){
        console.error('No se pudo autoguardar la selección:',error);
        toast('No se pudo guardar el cambio. Se reintentará.');
        if(versionActual===versionSeleccion)temporizadorAutoguardado=setTimeout(guardarBorradorEnSupabase,2500);
    }finally{
        guardadoEnCurso=false;
        if(versionActual!==versionSeleccion)temporizadorAutoguardado=setTimeout(guardarBorradorEnSupabase,0);
    }
}

function esPrevisualizacionProtegida(elemento){
    return !galeriaAprobada&&Boolean(elemento?.closest?.('.photo-card, #modal-lightbox'));
}

document.addEventListener('contextmenu',evento=>{if(esPrevisualizacionProtegida(evento.target))evento.preventDefault()});
document.addEventListener('dragstart',evento=>{if(esPrevisualizacionProtegida(evento.target))evento.preventDefault()});
document.addEventListener('copy',evento=>{if(esPrevisualizacionProtegida(document.activeElement)||esPrevisualizacionProtegida(evento.target))evento.preventDefault()});
document.addEventListener('keydown',evento=>{
    if(galeriaAprobada)return;
    const tecla=evento.key.toLowerCase(),atajo=evento.ctrlKey||evento.metaKey;
    if(atajo&&(tecla==='s'||tecla==='u'||tecla==='p')){
        evento.preventDefault();
        toast('Las fotografías estarán disponibles al aprobar la selección.');
    }
});

document.head.insertAdjacentHTML('beforeend','<style>.photo-card img,#img-lightbox{-webkit-user-drag:none;user-select:none;-webkit-user-select:none}.photo-card{user-select:none;-webkit-user-select:none}</style>');

function observadorImagenes(){
    const io=new IntersectionObserver(entries=>entries.forEach(e=>{
        if(!e.isIntersecting)return;
        const img=e.target;
        img.src=img.dataset.src;
        delete img.dataset.src;
        img.onload=()=>img.closest('.photo-card').classList.add('is-visible');
        io.unobserve(img);
    }),{rootMargin:'400px'});
    document.querySelectorAll('img[data-src]').forEach(i=>io.observe(i));
}

function renderizarFotos(lista){
    const grid=$('#grid-fotos');
    grid.innerHTML='';
    lista.forEach((foto,index)=>{
        const selected=fotosSeleccionadas.includes(foto.id), card=document.createElement('article');
        card.className=`photo-card ${selected?'is-selected':''}`;
        card.dataset.id=foto.id;
        card.innerHTML=`<img data-src="${foto.url}" alt="Fotografía ${index+1}" loading="lazy"><div class="photo-overlay"></div>${conMarcaAgua?'<div class="watermark">MR. FIESTA</div>':''}<button class="favorite" aria-label="${selected?'Quitar de':'Añadir a'} favoritos"><i data-lucide="heart" size="18"></i></button>`;
        card.querySelector('img').addEventListener('click',()=>abrirLightbox(index));
        card.querySelector('.favorite').addEventListener('click',event=>{
            event.stopPropagation();
            alternarSeleccion(foto.id,card);
        });
        grid.append(card);
    });
    lucide.createIcons();
    observadorImagenes();
}

function alternarSeleccion(idFoto,card){
    if(galeriaAprobada){
        toast('Esta galería ya fue aprobada.');
        return;
    }
    const index=fotosSeleccionadas.indexOf(idFoto);
    if(index>-1){
        fotosSeleccionadas.splice(index,1);
        card.classList.remove('is-selected');
    }else{
        if(fotosSeleccionadas.length>=limiteMaximo){
            toast(`El límite es de ${limiteMaximo} fotografías.`);
            return;
        }
        fotosSeleccionadas.push(idFoto);
        card.classList.add('is-selected');
    }
    actualizarContadorUI();
    actualizarFavoritoLightbox();
    programarAutoguardado();
}

function abrirLightbox(index){
    indiceLightbox=index;
    const foto=fotos[index];
    const img=$('#img-lightbox');
    img.src=foto.url;
    img.style.transform='scale(1)';
    $('#modal-lightbox').classList.add('open');
    document.body.style.overflow='hidden';
    if(fotos[index+1])new Image().src=fotos[index+1].url;
    actualizarFavoritoLightbox();
}

function cerrarLightbox(){
    $('#modal-lightbox').classList.remove('open');
    document.body.style.overflow='';
}

function moverLightbox(delta){
    if(!fotos.length)return;
    abrirLightbox((indiceLightbox+delta+fotos.length)%fotos.length);
}

function actualizarFavoritoLightbox(){
    const selected=fotos[indiceLightbox]&&fotosSeleccionadas.includes(fotos[indiceLightbox].id);
    $('#favorito-lightbox').setAttribute('aria-label',selected?'Quitar de favoritos':'Añadir a favoritos');
    $('#favorito-lightbox').style.background=selected?'#fff':'rgba(255,255,255,.12)';
    $('#favorito-lightbox').style.color=selected?'#111':'#fff';
}

async function inicializarGaleria(){
    if(!slugGaleria){
        mostrarError('Este enlace de galería no es válido.');
        return;
    }
    const {data:galeriaData,error:galeriaError}=await _supabase.from('galerias').select('*').eq('slug',slugGaleria).single();
    if(galeriaError||!galeriaData){
        mostrarError('Esta galería no está disponible.');
        return;
    }
    $('#titulo-evento').textContent=galeriaData.client_name;
    document.title=`${galeriaData.client_name} · Mr. Fiesta`;
    folderIdDrive=galeriaData.folder_id;
    subfolderIdDrive=galeriaData.subfolder_id||'';
    galeriaUuid=galeriaData.id;
    limiteMaximo=parseInt(galeriaData.limite_fotos)||100;
    conMarcaAgua=galeriaData.con_marca_agua!==false;
    galeriaAprobada=galeriaData.aprobado===true;
    seleccionYaEnviada=Boolean(subfolderIdDrive);

    const {data:seleccionesPrevias}=await _supabase.from('selecciones').select('foto_id').eq('galeria_id',galeriaUuid);
    if(seleccionesPrevias?.length){
        fotosYaRegistradas=new Set(seleccionesPrevias.map(x=>x.foto_id));
        fotosSeleccionadas=[...fotosYaRegistradas];
    }
    actualizarContadorUI();

    try{
        const res=await fetch(`${APPS_SCRIPT_URL}?action=obtenerFotos&folderId=${encodeURIComponent(folderIdDrive)}`);
        const resultado=await res.json();
        if(!resultado.success||!resultado.fotos?.length){
            $('#grid-fotos').innerHTML='<div class="empty">Aún no hay fotografías para mostrar.</div>';
            return;
        }
        fotos=resultado.fotos;
        const portada=fotos.find(f=>f.name?.toUpperCase().startsWith('PORTADA_'))||fotos[0];
        $('#hero-media').style.backgroundImage=`url("${portada.url}")`;
        renderizarFotos(fotos);
        actualizarEstadoFinal();
    }catch(e){
        console.error(e);
        mostrarError('No fue posible cargar las fotografías. Inténtalo nuevamente.');
    }
}

function actualizarEstadoFinal(){
    const btn=$('#btn-enviar');
    if(galeriaAprobada){
        btn.style.display='none';
        const destino=subfolderIdDrive||folderIdDrive;
        const link=$('#enlace-descarga');
        link.href=`https://drive.google.com/drive/folders/${destino}`;
        link.classList.add('show');
        $('#texto-instruccion').textContent='Tu selección está aprobada. Ya puedes descargar tus fotografías en alta definición.';
        $('#estado-hero').textContent='Selección aprobada';

        // --- INYECCIÓN DEL BOTÓN MÁGICO DE ÁLBUM DIGITAL ---
        const actionsContainer = $('#hero-actions-container');
        if(actionsContainer && !$('#btn-ver-album')){
            const btnAlbum = document.createElement('a');
            btnAlbum.id = 'btn-ver-album';
            btnAlbum.href = `album.html?galeria=${slugGaleria}`;
            btnAlbum.className = 'hero-action inline-flex items-center gap-2 border border-amber-300/40 bg-amber-300/10 hover:bg-amber-300/20 text-amber-300 transition-all duration-300';
            btnAlbum.innerHTML = `Ver Álbum Digital <i data-lucide="book-open" size="18"></i>`;
            actionsContainer.appendChild(btnAlbum);
            if(typeof lucide !== 'undefined'){
                lucide.createIcons();
            }
        }
    }else if(seleccionYaEnviada){
        btn.textContent='Selección enviada';
        $('#texto-instruccion').textContent='Tu selección fue enviada al estudio correctamente.';
        $('#estado-hero').textContent='Esperando aprobación';
    }
}

function mostrarError(text){
    $('#titulo-evento').textContent='Galería no disponible';
    $('#grid-fotos').innerHTML=`<div class="empty">${escapeHtml(text)}</div>`;
    $('#selection-bar').style.display='none';
}

function abrirConfirmacion(){
    if(!fotosSeleccionadas.length){
        toast('Elige al menos una fotografía.');
        return;
    }
    $('#dialog-texto').textContent=`Enviarás ${fotosSeleccionadas.length} fotografía${fotosSeleccionadas.length===1?'':'s'} al estudio.`;
    $('#dialog-confirmar').showModal();
}

async function enviarSeleccion(){
    const dialog=$('#dialog-confirmar'),confirmar=$('#confirmar-envio');
    dialog.close();
    confirmar.disabled=true;
    const btn=$('#btn-enviar');
    btn.textContent='Enviando…';
    btn.disabled=true;

    await _supabase.from('selecciones').delete().eq('galeria_id',galeriaUuid);
    const registros=fotosSeleccionadas.map(foto_id=>({galeria_id:galeriaUuid,foto_id}));
    const {error}=await _supabase.from('selecciones').insert(registros);
    if(error){
        toast(`No se pudo guardar: ${error.message}`);
        btn.textContent='Finalizar selección';
        btn.disabled=false;
        confirmar.disabled=false;
        return;
    }
    try{
        const response=await fetch(APPS_SCRIPT_URL,{
            method:'POST',
            headers:{'Content-Type':'text/plain;charset=utf-8'},
            body:JSON.stringify({action:'procesarSeleccion',folderId:folderIdDrive,ids:fotosSeleccionadas})
        });
        const resultado=await response.json();
        if(resultado.success){
            subfolderIdDrive=resultado.subfolderId;
            await _supabase.from('galerias').update({subfolder_id:subfolderIdDrive}).eq('id',galeriaUuid);
            seleccionYaEnviada=true;
            btn.textContent='Selección enviada';
            toast('Tu selección fue enviada al estudio.');
            $('#texto-instruccion').textContent='Tus favoritos ya fueron entregados al estudio.';
            actualizarContadorUI();
        }else{
            toast(`La selección se guardó, pero Drive informó: ${resultado.error||'un detalle'}`);
            btn.textContent='Finalizar selección';
            btn.disabled=false;
        }
    }catch(e){
        console.error(e);
        toast('No se pudo conectar con el servidor.');
        btn.textContent='Finalizar selección';
        btn.disabled=false;
    }finally{
        confirmar.disabled=false;
    }
}

$('#btn-enviar').addEventListener('click',abrirConfirmacion);
$('#cancelar-envio').addEventListener('click',()=>$('#dialog-confirmar').close());
$('#confirmar-envio').addEventListener('click',enviarSeleccion);
$('#cerrar-lightbox').addEventListener('click',cerrarLightbox);
$('#anterior-foto').addEventListener('click',()=>moverLightbox(-1));
$('#siguiente-foto').addEventListener('click',()=>moverLightbox(1));
$('#favorito-lightbox').addEventListener('click',()=>{
    const card=document.querySelector(`.photo-card[data-id="${fotos[indiceLightbox].id}"]`);
    alternarSeleccion(fotos[indiceLightbox].id,card);
});

document.addEventListener('keydown',e=>{
    if(!$('#modal-lightbox').classList.contains('open'))return;
    if(e.key==='Escape')cerrarLightbox();
    if(e.key==='ArrowRight')moverLightbox(1);
    if(e.key==='ArrowLeft')moverLightbox(-1);
});

let touchStart=0;
$('#modal-lightbox').addEventListener('touchstart',e=>touchStart=e.changedTouches[0].screenX,{passive:true});
$('#modal-lightbox').addEventListener('touchend',e=>{
    const d=e.changedTouches[0].screenX-touchStart;
    if(Math.abs(d)>45)moverLightbox(d>0?-1:1);
},{passive:true});

inicializarGaleria();