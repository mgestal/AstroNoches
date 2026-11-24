#!/usr/bin/env python3
"""AstroNoches ephemeris engine. Requires PyEphem (ephem). Input/output: JSON."""
import json, sys
from datetime import datetime, date, time, timedelta, timezone
from zoneinfo import ZoneInfo
import ephem

BODIES = [
    ("Sol", ephem.Sun), ("Luna", ephem.Moon),
    ("Mercurio", ephem.Mercury), ("Venus", ephem.Venus),
    ("Marte", ephem.Mars), ("Júpiter", ephem.Jupiter), ("Saturno", ephem.Saturn),
]

def iso(dt):
    return dt.astimezone(timezone.utc).isoformat().replace('+00:00', 'Z')

def observer_for(lat, lon, elevation, when, horizon='0'):
    obs = ephem.Observer()
    obs.lat, obs.lon = str(lat), str(lon)
    obs.elevation = int(elevation)
    obs.pressure = 0  # geometric altitude; consistent and reproducible
    obs.horizon = horizon
    obs.date = when.astimezone(timezone.utc).replace(tzinfo=None)
    return obs

def event(observer, method):
    try:
        value = getattr(observer, method)(ephem.Sun())
        return ephem.Date(value).datetime().replace(tzinfo=timezone.utc).isoformat().replace('+00:00','Z')
    except (ephem.AlwaysUpError, ephem.NeverUpError):
        return None

def main(payload):
    lat=float(payload['lat']); lon=float(payload['lon']); elevation=int(payload.get('elevation', 0))
    tz=ZoneInfo(payload.get('timezone') or 'Europe/Madrid')
    instant=datetime.fromisoformat(payload['datetime'].replace('Z','+00:00'))
    if instant.tzinfo is None: instant=instant.replace(tzinfo=tz)
    instant=instant.astimezone(timezone.utc)
    obs=observer_for(lat,lon,elevation,instant)
    objects=[]; moon=None
    for name, cls in BODIES:
        body=cls(); body.compute(obs)
        item={'name':name,'ra':float(body.ra)*180/ephem.pi,'dec':float(body.dec)*180/ephem.pi,
              'alt':float(body.alt)*180/ephem.pi,'az':(float(body.az)*180/ephem.pi)%360,
              'distance_au':float(getattr(body,'earth_distance',0.0)),
              'magnitude':float(getattr(body,'mag',0.0)) if hasattr(body,'mag') else None}
        objects.append(item)
        if name=='Luna':
            phase=float(body.phase)
            prev=ephem.previous_new_moon(obs.date)
            age=float(obs.date-prev)
            moon={'illumination':phase,'age_days':age,'phase_name':phase_name(phase,age)}
    # Local observing date: sunset and sunrise, plus civil/nautical/astronomical twilight.
    local_date=instant.astimezone(tz).date()
    local_noon=datetime.combine(local_date,time(12,0),tzinfo=tz).astimezone(timezone.utc)
    twilight={}
    for label, horizon in [('sunset','0'),('civil','-6'),('nautical','-12'),('astronomical','-18')]:
        o=observer_for(lat,lon,elevation,local_noon,horizon)
        setting=event(o,'next_setting')
        if setting:
            o.date=ephem.Date(datetime.fromisoformat(setting.replace('Z','+00:00')).replace(tzinfo=None))
            rising=event(o,'next_rising')
        else: rising=None
        twilight[label]={'evening':setting,'morning':rising}
    return {'engine':'PyEphem','engine_version':getattr(ephem,'__version__','unknown'),
            'computed_at':iso(instant),'location':{'lat':lat,'lon':lon,'elevation_m':elevation,'timezone':str(tz)},
            'objects':objects,'moon':moon,'twilight':twilight}

def phase_name(illum, age):
    if illum < 1.5: return 'Luna nueva'
    if illum > 98.5: return 'Luna llena'
    if age < 7.38: return 'Creciente'
    if age < 14.77: return 'Gibosa creciente'
    if age < 22.15: return 'Gibosa menguante'
    return 'Menguante'

if __name__ == '__main__':
    try:
        data=json.load(sys.stdin)
        print(json.dumps(main(data), ensure_ascii=False, allow_nan=False))
    except Exception as exc:
        print(json.dumps({'error':str(exc)},ensure_ascii=False),file=sys.stderr)
        sys.exit(1)
