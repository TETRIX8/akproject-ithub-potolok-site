#!/usr/bin/env python3
import os, secrets, time, json, sqlite3
from flask import Flask, jsonify, request, make_response
import requests

API_URL='https://api.newlxp.ru/graphql'; DB='/var/lib/lxp-gateway/users.sqlite3'
app=Flask(__name__); sessions={}
SIGN_IN='''query SignIn($input: SignInInput!) { signIn(input: $input) { user { id isLead __typename } accessToken __typename } }'''
GET_ME='''query GetMe { getMe { avatar createdAt email firstName id isLead roles phoneNumber legalDocumentsApprovedAt assignedSuborganizations { suborganization { name __typename } __typename } teacher { assignedDisciplines_V2 { discipline { name code studyPeriods { name startDate endDate __typename } __typename } __typename } __typename } __typename } }'''

def conn():
 os.makedirs(os.path.dirname(DB),exist_ok=True); c=sqlite3.connect(DB); c.row_factory=sqlite3.Row; c.execute('''CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, profile TEXT NOT NULL, taps INTEGER NOT NULL DEFAULT 0, crosses INTEGER NOT NULL DEFAULT 0, rating INTEGER NOT NULL DEFAULT 1000, updated REAL NOT NULL)'''); c.commit(); return c

def gql(q,v=None,t=None):
 h={'Content-Type':'application/json'}
 if t:h['Authorization']='Bearer '+t
 r=requests.post(API_URL,json={'query':q,'variables':v or {}},headers=h,timeout=15); r.raise_for_status(); return r.json()

def clean(u):
 ds=[]
 for item in ((u.get('teacher') or {}).get('assignedDisciplines_V2') or []):
  d=item.get('discipline') or {}; ds.append({'name':d.get('name'),'code':d.get('code'),'periods':d.get('studyPeriods') or []})
 orgs=[((x.get('suborganization') or {}).get('name')) for x in u.get('assignedSuborganizations') or []]
 return {'id':u.get('id'),'firstName':u.get('firstName'),'email':u.get('email'),'avatar':u.get('avatar'),'roles':u.get('roles') or [],'phoneNumber':u.get('phoneNumber'),'createdAt':u.get('createdAt'),'organizations':[x for x in orgs if x],'disciplines':ds}

def row_profile(row):
 p=json.loads(row['profile']); p.update({'taps':row['taps'],'crosses':row['crosses'],'rating':row['rating']}); return p

def current():
 sid=request.cookies.get('lxp_session'); x=sessions.get(sid)
 if not x or x['expires']<time.time(): return None
 c=conn(); r=c.execute('SELECT * FROM users WHERE id=?',(x['id'],)).fetchone(); c.close(); return r

@app.post('/api/lxp/login')
def login():
 b=request.get_json(silent=True) or {}; email=str(b.get('email','')).strip(); password=b.get('password','')
 if not email or not password:return jsonify(error='Введите email и пароль'),400
 try:
  d=gql(SIGN_IN,{'input':{'email':email,'password':password}})
  if d.get('errors'):return jsonify(error='Неверный email или пароль'),401
  result=(d.get('data') or {}).get('signIn') or {}; token=result.get('accessToken')
  if not token:return jsonify(error='Авторизация не подтверждена'),401
  me=gql(GET_ME,t=token); u=(me.get('data') or {}).get('getMe')
  if not u:return jsonify(error='Профиль не найден'),502
  p=clean(u); c=conn(); old=c.execute('SELECT taps,crosses,rating FROM users WHERE id=?',(p['id'],)).fetchone()
  if old: c.execute('UPDATE users SET profile=?,updated=? WHERE id=?',(json.dumps(p,ensure_ascii=False),time.time(),p['id']))
  else: c.execute('INSERT INTO users(id,profile,updated) VALUES(?,?,?)',(p['id'],json.dumps(p,ensure_ascii=False),time.time()))
  c.commit(); row=c.execute('SELECT * FROM users WHERE id=?',(p['id'],)).fetchone(); c.close()
  sid=secrets.token_urlsafe(32); sessions[sid]={'token':token,'id':p['id'],'expires':time.time()+86400}; resp=make_response(jsonify(profile=row_profile(row))); resp.set_cookie('lxp_session',sid,httponly=True,secure=True,samesite='Lax',max_age=86400); return resp
 except requests.RequestException:return jsonify(error='Сервис NewLXP временно недоступен'),502
 except Exception:return jsonify(error='Не удалось завершить авторизацию'),502

@app.get('/api/lxp/me')
def me():
 r=current(); return jsonify(authenticated=bool(r),profile=row_profile(r) if r else None)

@app.post('/api/lxp/tap')
def tap():
 r=current()
 if not r:return jsonify(error='Требуется вход'),401
 c=conn(); taps=r['taps']+1; crosses=taps//10; rating=1000+taps+crosses*50
 c.execute('UPDATE users SET taps=?,crosses=?,rating=?,updated=? WHERE id=?',(taps,crosses,rating,time.time(),r['id'])); c.commit(); row=c.execute('SELECT * FROM users WHERE id=?',(r['id'],)).fetchone(); c.close(); return jsonify(profile=row_profile(row),newCross=(crosses>r['crosses']))

@app.post('/api/lxp/boost')
def boost():
 r=current()
 if not r:return jsonify(error='Требуется вход'),401
 if r['crosses']<1:return jsonify(error='Сначала заработай крест на 10 тапах'),400
 c=conn(); rating=r['rating']+100; c.execute('UPDATE users SET rating=?,crosses=crosses-1,updated=? WHERE id=?',(rating,time.time(),r['id'])); c.commit(); row=c.execute('SELECT * FROM users WHERE id=?',(r['id'],)).fetchone(); c.close(); return jsonify(profile=row_profile(row))

@app.get('/api/lxp/leaderboard')
def leaderboard():
 if not current():return jsonify(error='Требуется вход'),401
 c=conn(); rows=c.execute('SELECT profile,taps,crosses,rating FROM users ORDER BY rating DESC, taps DESC LIMIT 100').fetchall(); c.close(); out=[]
 for i,r in enumerate(rows,1):
  p=json.loads(r['profile']); out.append({'place':i,'name':p.get('firstName') or 'Участник','avatar':p.get('avatar'),'rating':r['rating'],'taps':r['taps'],'crosses':r['crosses']})
 return jsonify(items=out)

@app.post('/api/lxp/logout')
def logout():
 sessions.pop(request.cookies.get('lxp_session'),None); resp=make_response(jsonify(ok=True)); resp.delete_cookie('lxp_session'); return resp

if __name__=='__main__': app.run(host='127.0.0.1',port=9191)
