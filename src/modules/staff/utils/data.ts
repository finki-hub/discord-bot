import {
  loadDirectusItems,
  schedulePeriodicReload,
} from '@/common/utils/data.js';

import { type Staff, StaffSchema } from '../schemas/Staff.js';
import { clearTransformedProfessors } from './cache.js';

const STAFF_FIELDS = [
  'active',
  'cabinet',
  'consultations',
  'courses',
  'email',
  'name',
  'position',
  'profile',
  'title',
];

const state: { staff: Staff[] } = {
  staff: [],
};

export const reloadStaff = async () => {
  await loadDirectusItems({
    collection: 'staff',
    fields: STAFF_FIELDS,
    label: 'staff',
    onLoaded: (data: Staff[]) => {
      state.staff = data;
      clearTransformedProfessors();
    },
    schema: StaffSchema.array(),
  });
};

export const startPeriodicReload = () => {
  schedulePeriodicReload({
    label: 'staff',
    reload: reloadStaff,
  });
};

export const getStaff = (): Staff[] => state.staff;
