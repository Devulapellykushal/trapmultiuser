# Generated migration for password reset + welcome email tracking

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('users', '0002_seed_quake_dev_users'),
    ]

    operations = [
        migrations.AddField(
            model_name='user',
            name='welcome_email_sent_at',
            field=models.DateTimeField(
                blank=True,
                help_text='When the one-time welcome email was sent',
                null=True,
            ),
        ),
        migrations.CreateModel(
            name='PasswordResetToken',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('token', models.CharField(db_index=True, max_length=64, unique=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('expires_at', models.DateTimeField()),
                ('used_at', models.DateTimeField(blank=True, null=True)),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='password_reset_tokens', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'db_table': 'users_password_reset_token',
            },
        ),
        migrations.AddIndex(
            model_name='passwordresettoken',
            index=models.Index(fields=['token'], name='users_passw_token_idx'),
        ),
        migrations.AddIndex(
            model_name='passwordresettoken',
            index=models.Index(fields=['user', '-created_at'], name='users_passw_user_created_idx'),
        ),
    ]
