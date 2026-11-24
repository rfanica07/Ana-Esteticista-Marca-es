insert into public.services(id,name,category,minutes,price)
values('buco-sobrancelhas','Buço e sobrancelhas','Rosto',10,7.50)
on conflict(id) do update set name=excluded.name,category=excluded.category,minutes=excluded.minutes,price=excluded.price;
