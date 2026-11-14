type SettingsSectionProps = {
   title: string
   description: React.ReactNode
   children: React.ReactNode
}

/** Title + explanation on the left, the controls on the right (stacked on phones). */
const SettingsSection = ({ title, description, children }: SettingsSectionProps) => (
   <section className='grid gap-4 border-b py-8 first:pt-0 last:border-b-0 last:pb-0 md:grid-cols-[minmax(0,16rem)_minmax(0,1fr)] md:gap-10'>
      <div>
         <h2 className='font-semibold'>{title}</h2>
         <p className='mt-1 text-sm text-muted-foreground'>{description}</p>
      </div>
      <div className='max-w-md min-w-0'>{children}</div>
   </section>
)

export default SettingsSection
