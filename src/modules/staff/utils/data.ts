import {
  loadJsonResource,
  schedulePeriodicReload,
} from '@/common/utils/data.js';

import { type Staff, StaffSchema } from '../schemas/Staff.js';
import { clearTransformedProfessors } from './cache.js';

const state: { staff: Staff[] } = {
  staff: [],
};

export const reloadStaff = async () => {
  await loadJsonResource({
    label: 'staff',
    onLoaded: (data: Staff[]) => {
      state.staff = data;
      clearTransformedProfessors();
    },
    resource: 'staff.json',
    schema: StaffSchema.array(),
  });
};

export const startPeriodicReload = () => {
  schedulePeriodicReload({ label: 'staff', reload: reloadStaff });
};

export const getStaff = (): Staff[] => state.staff;
