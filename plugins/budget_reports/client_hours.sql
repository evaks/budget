SELECT
  1 id,
  userid,
  firstname,
  lastname,
  sum(len) scheduled,
  sum(missed) missed,
  sum(slots) slots,
  sum(missedSlots) missedSlots
FROM (
  SELECT
    userid,
    firstname,
    lastname,
    date,
    max(len) len,
    sum(missed) missed,
    sum(slots) slots, sum(missedSlots) missedSlots
  FROM (
    SELECT
      firstname, lastname,
      userid, date, sum(len) len, sum(missed) missed, sum(slots) slots, sum(missedSlots) missedSlots
    FROM (
       SELECT
         coalesce(u.firstname, a.firstname) firstname,
         coalesce(u.lastname, a.lastname) lastname,
         a.userid,
         convert(replace(left(from_unixtime(a.start/1000),10),'-',''),UNSIGNED) date,
         (stop - start)/60000 len,
         IF(showed = 1,  0, (stop - start)/60000) missed, 1 slots,
         IF(showed = 1,  0, 1) missedSlots
       FROM appointments a LEFT JOIN user u ON a.userid = u.id
       WHERE (trim(a.firstname) <> '' OR trim(a.lastname) <> '') AND a.showed <> 4 ) appt
     WHERE
       appt.date >= ?:start: AND appt.date <= ?:stop:
     GROUP BY firstname, lastname, userid, date
     UNION SELECT
       u.firstname, u.lastname, u.id, ut.when, sum(ut.len), 0 missed, 0 slots, 0 missedSlots
     FROM user u, user_time ut
     WHERE
       ut.userid = u.id
       AND ut.when >= ?:start:
       AND ut.when <= ?:stop:
     GROUP BY u.id, u.firstname, u.lastname, ut.when) aa
   GROUP BY userid, firstname, lastname, date) aaa


