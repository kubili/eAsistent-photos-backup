# Varnostna kopija fotografij iz eAsistenta

Lokalna razširitev za Chrome ali Edge, ki shrani fotografije v polni ločljivosti iz galerije `vrtec.easistent.com/photos` v mapo po tvoji izbiri. Ne shranjuje prijavnih podatkov, ne bere ali izvaža piškotkov in ne uporablja storitev tretjih oseb.

## Namestitev

1. V Chromu odpri `chrome://extensions`, v Edge pa `edge://extensions`.
2. Vključi **Način za razvijalce**.
3. Izberi **Naloži razpakirano** in nato izberi mapo `photo-backup`.
4. V istem brskalniku se prijavi na <https://vrtec.easistent.com/photos>.
5. Ko je izbran zavihek `/photos`, klikni ikono razširitve. Odpre se nov zavihek z orodjem, ki samo počaka na podatke galerije; nalaganje sličic ni potrebno.

Dostop do spletnega mesta je omejen na `https://vrtec.easistent.com/*`. Razširitev uporablja tudi dovoljenji Chromium `activeTab` in `scripting`, da prebere prikazano galerijo v zavihku, iz katerega si jo odprl. Za zahteve po izvirnih fotografijah uporabi sejo, ki jo upravlja brskalnik.

## Uporaba

1. Izberi lokalno osnovno mapo. Brskalnik razširitvi dovoli pisanje v izbrano mapo za čas odprtega zavihka z orodjem.
2. Po želji nastavi datuma **Od** in **Do**. Oba datuma sta vključena. Če pustiš polji prazni, se upoštevajo vsi datumi v galeriji.
3. Nastavi **Premor med prenosi**. Privzeto je 250 ms; izbereš lahko od 100 do 1.500 ms v korakih po 50 ms.
4. Izberi **Preglej galerijo**, da preveriš število fotografij v obdobju in število že shranjenih fotografij. Pregled fotografij ne prenaša.
5. Izberi **Prenesi manjkajoče fotografije**.

Za pregled ni treba drseti po strani ali počakati, da se sličice naložijo. Orodje prebere metapodatke galerije in do 20 sekund samodejno preverja, kdaj so na voljo.

Mapa bo urejena tako:

```text
<izbrana osnovna mapa>/YYYY-MM-DD/fotografija_<id>.<končnica>
```

Razširitev prebere izvirni naslov `/image/original/{id}`, ne naslova predogledne sličice. Pred prenosom preveri ID fotografije v ustrezni datumski mapi. Pri naslednjih zagonih preskoči že obstoječe fotografije s tem načinom poimenovanja. Zahteve pošilja zaporedno s premorom, ki ga nastaviš v orodju.

## Zasebnost in omejitve

- Fotografije se prenesejo z `vrtec.easistent.com` in zapišejo neposredno v izbrano lokalno mapo.
- Razširitev po zaprtju zavihka ne ohrani dostopa do izbrane mape, datumov, piškotkov ali prijavnih žetonov.
- Po zaprtju ali osvežitvi zavihka z orodjem moraš osnovno mapo izbrati znova.
- Fotografij, ki jih preimenuješ ali premakneš iz te strukture, razširitev ne prepozna kot že shranjene.
- Izvorni zavihek mora prikazovati prijavljeno stran `/photos` z datumi in vrednostmi `data-original-src` pod `/image/original/`. Shranjena stran in JavaScript kažeta, da portal fotografije prikaže dinamično; razširitev vsakič pregleda trenutno odprto stran.
- Razširitev uporablja brskalnikov API za dostop do lokalnih map in je namenjena aktualnemu Chromu ali Edgeu.
