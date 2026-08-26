import uuid
from django.db import models


class Customer(models.Model):
    """Walk-in / fleet customer master for POS and GST billing."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organization = models.ForeignKey(
        'users.Organization',
        on_delete=models.PROTECT,
        related_name='customers',
        null=True,
        blank=True,
        help_text='Business workspace that owns this customer',
    )
    name = models.CharField(max_length=255)
    phone = models.CharField(max_length=20, db_index=True, blank=True, default='')
    email = models.EmailField(blank=True, default='')
    address = models.TextField(blank=True, default='')
    gstin = models.CharField(max_length=15, blank=True, default='')
    notes = models.TextField(blank=True, default='')
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['name']
        indexes = [
            models.Index(fields=['phone']),
            models.Index(fields=['name']),
        ]

    def __str__(self):
        return self.name
