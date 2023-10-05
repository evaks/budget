SELECT NULL id,
  firstname, lastname,
  SUM(open) opened, SUM(closed) closed, max(active) active, sum(used) used FROM (
  SELECT 
    new.firstname firstname, new.lastname,
    old.start is NULL OR DATE_ADD(old.start, INTERVAL 5 MONTH) < new.last open, 
    0 closed,
    DATE_ADD(new.recent, INTERVAL 5 MONTH)  >=  from_unixtime(floor(?:stop:/1000)) active,
    new.recent >=  from_unixtime(floor(?:start:/1000)) used    
  FROM (@newclient) new
  LEFT JOIN (@oldclient) old
  ON new.firstname = old.firstname and new.lastname = old.lastname
  UNION SELECT 
   old.firstname, old.lastname, 0 open, 
   (new.last is NULL AND DATE_ADD(old.start, INTERVAL 5 MONTH) < from_unixtime(floor(?:stop:/1000)))
    OR (new.last is NOT NULL AND DATE_ADD(old.start, INTERVAL 5 MONTH)  < new.last) closed,
   DATE_ADD(old.recent, INTERVAL 5 MONTH)  >=  from_unixtime(floor(?:stop:/1000)) active,
   0 used
  FROM (@newclient) new
  RIGHT JOIN (@oldclient) old
  ON new.firstname = old.firstname and new.lastname = old.lastname) tbl
            
