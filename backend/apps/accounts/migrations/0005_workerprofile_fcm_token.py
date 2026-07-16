from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0004_contractorprofile_area_contractorprofile_district_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="workerprofile",
            name="fcm_token",
            field=models.CharField(blank=True, max_length=255, null=True),
        ),
    ]
