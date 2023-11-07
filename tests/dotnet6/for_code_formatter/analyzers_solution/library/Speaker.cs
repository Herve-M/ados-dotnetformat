namespace library
{
    public class Speaker
    {
        private string lastName;

        public string SayHello(string name)
        {
            lastName = name;
            return $"Hello {lastName}.";
        }
    }
}
