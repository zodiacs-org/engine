# Interview: one question at a time

Ask one question per message. Wait for the answer. Confirm what you understood before the next question. Never guess an answer the person has not given.

| Step | Ask | Check before moving on |
| --- | --- | --- |
| 1 | "What name would you like me to use?" | Any name or none. |
| 2 | "What is your date of birth?" | A real calendar date. Repeat it back in words ("12 April 1971") to avoid day and month mix-ups. |
| 3 | "Do you know your exact time of birth?" | Yes, approximately, or no. |
| 3a | If yes or approximately: "What time, as written or as you remember it?" | Record it as local clock time. Ask "morning or evening?" if the answer is ambiguous. |
| 3b | "Where does that time come from: a birth certificate or hospital record, a family member, or memory?" | Record the source. |
| 3c | If approximately: "Within how many minutes do you think it is right?" | Record the margin. |
| 4 | "Which town or city were you born in, and in which country?" | Run the place lookup. If more than one place matches, list them and ask which. Confirm the place and its time zone. |
| 5 | Run `resolve_civil_time`. | If `resolved`, continue. If `gap` or `fold`, go to step 5a. |
| 5a | Gap: "Clocks there moved forward that night, so [time] did not exist. Is the time perhaps [time minus one hour] or [time plus one hour]?" Fold: "Clocks there moved back that night, so [time] happened twice. Do you know if it was the first or the second time?" | Do not continue until the person chooses, or says they do not know. If they do not know, treat the time as approximate with both readings, and say which facts differ. |
| 6 | Read back the summary: date, time and its source, place, time zone and UTC offset. "Is all of that right?" | Fix any part before calculating. |
| 7 | "Is there an area of life you would like the reading to look at most? For example work, relationships, home, or how you spend your time." | Optional. Record up to two focus areas. |
| 8 | "Would you like me to keep these details so I can follow your next 90 days with you?" | Yes stores the profile. No: give the reading, then forget the details. |

Then calculate the natal chart and give the first reading (`INSTRUCTIONS.md`, Calculated then Reading), followed by the 90-day calendar (`COACHING.md`).

## Tone

Short, warm and plain. One question per message. No astrology terms in the interview itself.
