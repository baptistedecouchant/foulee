"""Configure les e-mails de connexion Supabase (API de gestion) :
- modèles en français avec le code à 6 chiffres que l'app demande ;
- serveur d'envoi (SMTP) si les secrets SMTP_* existent, avec une limite d'envoi adaptée.
Aucune valeur secrète n'est affichée."""
import json, os, sys, urllib.request

ref, token = os.environ['PROJECT_REF'], os.environ['SUPABASE_ACCESS_TOKEN']

def box(title, intro, code_label):
    return f"""<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#0B1020">
<h2 style="margin:0 0 12px">{title}</h2>
<p style="margin:0 0 20px;color:#5A6380">{intro}</p>
<p style="margin:0 0 6px;color:#5A6380;font-size:13px">{code_label}</p>
<div style="font-size:34px;font-weight:800;letter-spacing:8px;background:#EEF1F8;border-radius:14px;padding:16px;text-align:center">{{{{ .Token }}}}</div>
<p style="margin:20px 0 0;color:#97A0BD;font-size:12px">Ce code expire dans 1 heure. Si tu n’as rien demandé, ignore cet e-mail.</p>
</div>"""

cfg = {
    'mailer_subjects_confirmation': 'Ton code Foulée : {{ .Token }}',
    'mailer_templates_confirmation_content': box('Bienvenue sur Foulée !', 'Entre ce code dans l’app pour confirmer ton adresse e-mail.', 'Ton code de confirmation'),
    'mailer_subjects_recovery': 'Ton code pour changer de mot de passe : {{ .Token }}',
    'mailer_templates_recovery_content': box('Nouveau mot de passe', 'Entre ce code dans l’app pour choisir un nouveau mot de passe.', 'Ton code'),
    'mailer_subjects_magic_link': 'Ton code de connexion Foulée : {{ .Token }}',
    'mailer_templates_magic_link_content': box('Connexion à Foulée', 'Entre ce code dans l’app pour te connecter.', 'Ton code de connexion'),
    'mailer_otp_length': 6,
    'mailer_otp_exp': 3600,
}

smtp = {k: os.environ.get(k, '').strip() for k in ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'SMTP_SENDER']}
if smtp['SMTP_HOST'] and smtp['SMTP_PASS'] and smtp['SMTP_SENDER']:
    cfg.update({
        'smtp_host': smtp['SMTP_HOST'],
        'smtp_port': smtp['SMTP_PORT'] or '465',
        'smtp_user': smtp['SMTP_USER'] or 'resend',
        'smtp_pass': smtp['SMTP_PASS'],
        'smtp_admin_email': smtp['SMTP_SENDER'],
        'smtp_sender_name': 'Foulée',
        'rate_limit_email_sent': 60,
    })
    print('Serveur d’envoi :', smtp['SMTP_HOST'], '· expéditeur :', '…@' + smtp['SMTP_SENDER'].split('@')[-1])
else:
    # Sans serveur d'envoi, Supabase (offre gratuite) interdit de modifier les modèles : on s'arrête là.
    print('Pas de secrets SMTP : envoi Supabase par défaut (membres de l’équipe uniquement, 2 e-mails par heure).')
    print('Ajoute SMTP_HOST, SMTP_USER, SMTP_PASS et SMTP_SENDER dans GitHub pour envoyer les codes à tout le monde.')
    sys.exit(0)

req = urllib.request.Request(
    f'https://api.supabase.com/v1/projects/{ref}/config/auth',
    data=json.dumps(cfg).encode(),
    method='PATCH',
    headers={'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'},
)
try:
    with urllib.request.urlopen(req) as r:
        d = json.load(r)
        print('Modèles avec code à 6 chiffres :', '{{ .Token }}' in (d.get('mailer_templates_confirmation_content') or ''))
        print('Limite d’e-mails par heure :', d.get('rate_limit_email_sent'))
except urllib.error.HTTPError as e:
    print('Échec de la configuration des e-mails :', e.code, e.read().decode()[:300])
    sys.exit(1)
