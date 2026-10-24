import { employmentOf, isBlueCollar, professionOf } from './classify';

it('classifies the profession from the title', () => {
  expect(professionOf('Senior Frontend Developer')).toBe('engineering');
  expect(professionOf('Data Analyst')).toBe('data');
  expect(professionOf('Senior Product Designer')).toBe('design');
  expect(professionOf('Digital Marketing Specialist')).toBe('marketing');
  expect(professionOf('Accounts Payable Accountant')).toBe('finance');
  expect(professionOf('Customer Support Agent')).toBe('customer-support');
  expect(professionOf('Zookeeper')).toBe('other');
});

it('reads the employment type from the board text, then the title', () => {
  expect(employmentOf('Developer', 'full_time')).toBe('full_time');
  expect(employmentOf('Marketing Intern')).toBe('internship');
  expect(employmentOf('Graduate Software Engineer')).toBe('graduate');
  expect(employmentOf('Designer', 'Contract')).toBe('contract');
  expect(employmentOf('Part-time Accountant')).toBe('part_time');
  expect(employmentOf('Accountant')).toBeNull();
});

it('drops manual-labour roles but keeps professional ones with the same words', () => {
  for (const t of [
    'Delivery Driver',
    'Warehouse Associate',
    'Security Guard',
    'Cashier',
    'Forklift Operator',
    'Housekeeper',
    'Electrician',
  ])
    expect(isBlueCollar(t)).toBe(true);
  for (const t of [
    'Delivery Manager',
    'Security Engineer',
    'Warehouse Systems Analyst',
    'Driver Assistance Software Engineer',
    'IT Technician',
    'Head Chef Consultant',
    'Software Developer',
  ])
    expect(isBlueCollar(t)).toBe(false);
});
