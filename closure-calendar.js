// Feriados nacionais: Código do Trabalho, art. 234.º.
// Moita: terça-feira após o segundo domingo de setembro.
export function easterSunday(year){
 const a=year%19,b=Math.floor(year/100),c=year%100,d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3);
 const h=(19*a+b-d-g+15)%30,i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451);
 const month=Math.floor((h+l-7*m+114)/31),day=(h+l-7*m+114)%31+1;
 return new Date(Date.UTC(year,month-1,day,12));
}
const iso=date=>date.toISOString().slice(0,10);
const shifted=(date,offset)=>{const value=new Date(date);value.setUTCDate(value.getUTCDate()+offset);return iso(value)};
export function holidayName(day){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(day||''))return null;
 const date=new Date(day+'T12:00:00Z');if(Number.isNaN(date.getTime())||iso(date)!==day)return null;
 const fixed={'01-01':'Ano Novo','04-25':'Dia da Liberdade','05-01':'Dia do Trabalhador','06-10':'Dia de Portugal','08-15':'Assunção de Nossa Senhora','10-05':'Implantação da República','11-01':'Todos os Santos','12-01':'Restauração da Independência','12-08':'Imaculada Conceição','12-25':'Natal'};
 if(fixed[day.slice(5)])return fixed[day.slice(5)];
 const easter=easterSunday(date.getUTCFullYear());
 if(day===shifted(easter,-2))return 'Sexta-feira Santa';
 if(day===iso(easter))return 'Domingo de Páscoa';
 if(day===shifted(easter,60))return 'Corpo de Deus';
 const september=new Date(Date.UTC(date.getUTCFullYear(),8,1,12));
 if(day===shifted(september,(7-september.getUTCDay())%7+9))return 'Feriado municipal da Moita';
 return null;
}
export function closedDayReason(day){
 const holiday=holidayName(day);if(holiday)return 'Feriado · '+holiday;
 const weekday=new Date(day+'T12:00:00Z').getUTCDay();
 return weekday===3?'Folga · quarta-feira':weekday===0?'Folga · domingo':null;
}
