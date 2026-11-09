import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslocoPipe } from '@jsverse/transloco';
import { ReferenceService } from '../../core/reference.service';
import { errorOf, nuit, phone9 } from '../validators';

/** Form model for an entity's identification data (sign-up, onboarding, company page). */
export function orgForm(fb: FormBuilder, extended = false): FormGroup {
  const base: Record<string, unknown> = {
    name: ['', [Validators.required, Validators.maxLength(200)]],
    email: ['', Validators.email],
    type: ['commercial', Validators.required],
    entity_subtype: [''],
    company_size: [''],
    sector: ['', Validators.required],
    tax_id: ['', nuit],
    address: [''],
    postal_box: [''],
    country: ['MZ'],
    province: [''],
    phone: ['', phone9],
  };
  if (extended) {
    Object.assign(base, {
      nuel: [''],
      constitution_date: [null],
      share_capital: [null, Validators.min(0)],
      shareholders: [null, Validators.min(0)],
      social_object: [''],
      fiscal_activity_start_date: [null],
    });
  }
  return fb.group(base);
}

@Component({
  selector: 'app-org-fields',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, TranslocoPipe],
  template: `
    <div class="grid gap-4 sm:grid-cols-2" [formGroup]="form()">
      <div class="sm:col-span-2">
        <label class="label" for="org-name">{{ 'org.name' | transloco }} *</label>
        <input id="org-name" class="input" formControlName="name" [class.invalid]="err('name')" />
        @if (err('name'); as e) { <p class="field-error">{{ e | transloco }}</p> }
      </div>
      <div>
        <label class="label" for="org-type">{{ 'org.type' | transloco }} *</label>
        <select id="org-type" class="input" formControlName="type" (change)="form().get('entity_subtype')!.setValue('')">
          @for (o of refs.options('entity_type'); track o.value) { <option [value]="o.value">{{ o.label }}</option> }
        </select>
      </div>
      <div>
        <label class="label" for="org-subtype">{{ 'org.subtype' | transloco }}</label>
        <select id="org-subtype" class="input" formControlName="entity_subtype">
          <option value="">{{ 'common.select' | transloco }}</option>
          @for (o of refs.options('entity_subtype', type()); track o.value) { <option [value]="o.value">{{ o.label }}</option> }
        </select>
      </div>
      <div>
        <label class="label" for="org-size">{{ 'org.size' | transloco }}</label>
        <select id="org-size" class="input" formControlName="company_size">
          <option value="">{{ 'common.select' | transloco }}</option>
          @for (o of refs.options('company_size'); track o.value) { <option [value]="o.value">{{ o.label }} — {{ o.hint }}</option> }
        </select>
      </div>
      <div>
        <label class="label" for="org-sector">{{ 'org.sector' | transloco }} *</label>
        <select id="org-sector" class="input" formControlName="sector" [class.invalid]="err('sector')">
          <option value="">{{ 'common.select' | transloco }}</option>
          @for (o of refs.options('sector'); track o.value) { <option [value]="o.value">{{ o.label }}</option> }
        </select>
        @if (err('sector'); as e) { <p class="field-error">{{ e | transloco }}</p> }
      </div>
      <div>
        <label class="label" for="org-nuit">NUIT</label>
        <input id="org-nuit" class="input" formControlName="tax_id" inputmode="numeric" maxlength="9" [class.invalid]="err('tax_id')" />
        @if (err('tax_id'); as e) { <p class="field-error">{{ e | transloco }}</p> }
      </div>
      @if (extended()) {
        <div>
          <label class="label" for="org-nuel">NUEL</label>
          <input id="org-nuel" class="input" formControlName="nuel" />
        </div>
      }
      <div>
        <label class="label" for="org-email">{{ 'org.email' | transloco }}</label>
        <input id="org-email" type="email" class="input" formControlName="email" [class.invalid]="err('email')" />
        @if (err('email'); as e) { <p class="field-error">{{ e | transloco }}</p> }
      </div>
      <div>
        <label class="label" for="org-phone">{{ 'org.phone' | transloco }}</label>
        <input id="org-phone" class="input" formControlName="phone" inputmode="tel" maxlength="9" [class.invalid]="err('phone')" />
        @if (err('phone'); as e) { <p class="field-error">{{ e | transloco }}</p> }
      </div>
      @if (extended()) {
        <div>
          <label class="label" for="org-cdate">{{ 'org.constitutionDate' | transloco }}</label>
          <input id="org-cdate" type="date" class="input" formControlName="constitution_date" />
        </div>
        <div>
          <label class="label" for="org-capital">{{ 'org.shareCapital' | transloco }}</label>
          <input id="org-capital" type="number" min="0" step="0.01" class="input" formControlName="share_capital" />
        </div>
        <div>
          <label class="label" for="org-shareholders">{{ 'org.shareholders' | transloco }}</label>
          <input id="org-shareholders" type="number" min="0" class="input" formControlName="shareholders" />
        </div>
        <div>
          <label class="label" for="org-fiscal">{{ 'org.fiscalStart' | transloco }}</label>
          <input id="org-fiscal" type="date" class="input" formControlName="fiscal_activity_start_date" />
        </div>
        <div class="sm:col-span-2">
          <label class="label" for="org-object">{{ 'org.socialObject' | transloco }}</label>
          <textarea id="org-object" rows="3" class="input" formControlName="social_object"></textarea>
        </div>
      }
      <div class="sm:col-span-2">
        <label class="label" for="org-address">{{ 'org.address' | transloco }}</label>
        <input id="org-address" class="input" formControlName="address" />
      </div>
      <div>
        <label class="label" for="org-province">{{ 'org.province' | transloco }}</label>
        <select id="org-province" class="input" formControlName="province">
          <option value="">{{ 'common.select' | transloco }}</option>
          @for (o of refs.options('province'); track o.value) { <option [value]="o.value">{{ o.label }}</option> }
        </select>
      </div>
      <div>
        <label class="label" for="org-pobox">{{ 'org.postalBox' | transloco }}</label>
        <input id="org-pobox" class="input" formControlName="postal_box" />
      </div>
    </div>
  `,
})
export class OrgFields {
  readonly form = input.required<FormGroup>();
  readonly extended = input(false);
  protected readonly refs = inject(ReferenceService);
  protected type(): string {
    return this.form().get('type')?.value ?? '';
  }
  protected err(name: string): string | null {
    return errorOf(this.form().get(name));
  }
}
