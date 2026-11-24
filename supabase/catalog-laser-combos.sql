insert into public.services(id,name,category,minutes,price) values
('laser-meia-perna-virilha-total-axilas','Meia perna + virilha total + axilas','Laser',20,35),
('laser-perna-completa-virilha','Perna completa + virilha','Laser',20,40),
('laser-perna-completa-virilha-total-axilas','Perna completa + virilha total + axilas','Laser',45,45),
('laser-virilha-axilas','Virilha + axilas','Laser',15,25)
on conflict(id) do update set name=excluded.name,category=excluded.category,minutes=excluded.minutes,price=excluded.price;
