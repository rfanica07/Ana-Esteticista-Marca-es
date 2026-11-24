const dayFormat = new Intl.DateTimeFormat('sv-SE', {timeZone:'Europe/Lisbon',year:'numeric',month:'2-digit',day:'2-digit'});
export const lisbonDay = value => dayFormat.format(new Date(value));
export const hour = value => new Intl.DateTimeFormat('pt-PT',{timeZone:'Europe/Lisbon',hour:'2-digit',minute:'2-digit'}).format(new Date(value));
export const fullDate = value => new Intl.DateTimeFormat('pt-PT',{timeZone:'Europe/Lisbon',weekday:'short',day:'numeric',month:'long'}).format(new Date(value));
export const pendingBookings = (bookings, now = new Date()) => bookings.filter(booking => booking.status === 'pending' && new Date(booking.starts_at) > now);
export function internationalPhone(value) {
 const digits = value.replace(/\D/g, '').replace(/^00/, '');
 return digits.length === 9 ? '351' + digits : digits;
}

export const dayBookings = (bookings, day) => bookings.filter(booking => lisbonDay(booking.starts_at) === day && ['pending','confirmed'].includes(booking.status)).sort((a,b)=>new Date(a.starts_at)-new Date(b.starts_at)||a.id.localeCompare(b.id));
