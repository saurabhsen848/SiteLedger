import { useEffect, useState } from 'react';
import { ExternalLink, FileText, Plus, X } from 'lucide-react';

const categories=['Architecture','Design','Construction','Finance','Reference'];
export function ResourceCard({resource}){
  return <article className="panel resource-card">
    {resource.image&&<img className="resource-image" src={resource.image} alt="Architect working at a drawing table"/>}
    <div className="resource-card-body"><span className="status-pill blue">{resource.category}</span><div className="eyebrow resource-source">{resource.source||'Reference'}</div>
      <h3>{resource.title}</h3><p>{resource.description}</p>
      {resource.url&&<a className="btn light" href={resource.url} target="_blank" rel="noopener noreferrer">Open resource <ExternalLink size={14}/></a>}
    </div>
  </article>;
}
export default function ResourcesPage({initialResources,onSave}){
  const [resources,setResources]=useState(initialResources),[showForm,setShowForm]=useState(false),[form,setForm]=useState({title:'',description:'',image:'',source:'',url:'',category:'Reference'});
  useEffect(()=>{setResources(initialResources)},[initialResources]);
  function add(e){e.preventDefault();const next=[{...form},...resources];setResources(next);onSave(next);setForm({title:'',description:'',image:'',source:'',url:'',category:'Reference'});setShowForm(false)}
  function remove(index){const next=resources.filter((_,i)=>i!==index);setResources(next);onSave(next)}
  return <><div className="page-heading"><div><div className="eyebrow">WORKSPACE / LIBRARY</div><h1>Resources & references</h1><p>Useful external links and local visual references for studio work.</p></div><button className="btn primary" onClick={()=>setShowForm(!showForm)}>{showForm?<X size={15}/>:<Plus size={15}/>} {showForm?'Close':'Add resource'}</button></div>
    {showForm&&<form className="panel resource-form" onSubmit={add}><div className="form-grid">{[['title','Title'],['description','Description'],['image','Local image path'],['source','Source'],['url','External URL']].map(([key,label])=><label className={key==='description'?'full-field':''} key={key}>{label}<input required={key==='title'} type={key==='url'?'url':'text'} value={form[key]} onChange={e=>setForm({...form,[key]:e.target.value})}/></label>)}<label>Category<select value={form.category} onChange={e=>setForm({...form,category:e.target.value})}>{categories.map(c=><option key={c}>{c}</option>)}</select></label></div><div className="modal-foot"><button className="btn primary"><Plus size={14}/> Save resource</button></div></form>}
    <div className="resource-grid">{resources.map((resource,index)=><div className="resource-wrap" key={`${resource.url}-${index}`}><ResourceCard resource={resource}/><button className="resource-remove" aria-label={`Remove ${resource.title}`} onClick={()=>remove(index)}><X size={14}/></button></div>)}</div>
    {!resources.length&&<div className="panel empty-state"><FileText size={24}/><h3>No saved resources yet</h3><p>Add resource URLs and images as references for the studio team.</p></div>}
    <div className="note-banner"><FileText size={16}/><div><b>External resources open separately</b><p>Core project management works independently of these links.</p></div></div>
  </>;
}
