SELECT 
   firstname, lastname, min(start) last, max(start) recent
FROM (
  SELECT 
  COALESCE(u.firstname, a.firstname) firstname,
  COALESCE(u.lastname, a.lastname) lastname,
  DATE(from_unixtime(floor(start/1000))) start 
FROM appointments a 
  LEFT JOIN user u ON u.id = a.userid 
  WHERE showed IN  (0, 1, 2) AND ?:start: <= a.start AND ?:stop: > a.start
UNION SELECT 
  firstname, lastname, 
  STR_TO_DATE(ut.`when`, '%Y%m%d') start 
FROM user_time ut, user u 
  WHERE u.id = ut.userid 
  AND date_format(from_unixtime(floor(?:start:/1000)),'%Y%m%d') <= ut.when 
  AND date_format(from_unixtime(floor(?:stop:/1000)),'%Y%m%d') > ut.when) newsrc
GROUP BY firstname, lastname
