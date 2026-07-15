import django.db.models.deletion
import uuid
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('bot2', '0011_survey_idempotency_key'),
    ]

    operations = [
        migrations.CreateModel(
            name='Bot2Document',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('doc_type', models.CharField(choices=[('cv', 'CV'), ('certificate', 'Certificate')], max_length=20)),
                ('file', models.FileField(upload_to='bot2/docs/%Y/%m/')),
                ('original_filename', models.CharField(blank=True, max_length=255)),
                ('mime_type', models.CharField(blank=True, max_length=100)),
                ('file_size', models.PositiveIntegerField(blank=True, null=True)),
                ('student', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='bot2_documents', to='bot2.bot2student')),
                ('survey', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='bot2_documents', to='bot2.bot2surveyresponse')),
            ],
            options={
                'ordering': ('-created_at',),
            },
        ),
    ]
